import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

token = os.environ['GITHUB_TOKEN']
headers = {
    'Authorization': f'token {token}',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'and3rn3t-portfolio-updater',
}
BASE = 'https://api.github.com'
USERNAME = 'and3rn3t'

def gh_get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def gh_get_all(url):
    """Fetch every page until the API returns fewer than per_page items."""
    results, page = [], 1
    while True:
        sep = '&' if '?' in url else '?'
        paged = f'{url}{sep}page={page}'
        req = urllib.request.Request(paged, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            chunk = json.loads(resp.read().decode())
        if not chunk:
            break
        results.extend(chunk)
        if len(chunk) < 100:
            break
        page += 1
    return results

def gh_graphql(query, variables):
    body = json.dumps({'query': query, 'variables': variables}).encode()
    req = urllib.request.Request(
        f'{BASE}/graphql',
        data=body,
        headers={**headers, 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

print('Fetching user data...')
user = gh_get(f'{BASE}/users/{USERNAME}')

print('Fetching repositories (paginated, sorted by push date)...')
repos = gh_get_all(
    f'{BASE}/users/{USERNAME}/repos?sort=pushed&direction=desc&per_page=100'
)
print(f'  {len(repos)} repositories fetched')

print('Fetching public events (up to 3 pages)...')
try:
    events = []
    for page in range(1, 4):
        chunk = gh_get(f'{BASE}/users/{USERNAME}/events/public?per_page=30&page={page}')
        events.extend(chunk)
        if len(chunk) < 30:
            break  # no more pages
except Exception as exc:
    print(f'  Events unavailable: {exc}')
    events = []

# The events API no longer includes commit lists in PushEvent payloads or
# titles in PullRequestEvent payloads; fill them back in from the commit/PR
# endpoints so the activity feed can show real messages.
print('Hydrating push commits and PR titles...')
lookups, hydrated = {}, 0
def lookup(url):
    if url not in lookups:
        try:
            lookups[url] = gh_get(url)
        except Exception as exc:
            print(f'  Lookup failed for {url}: {exc}')
            lookups[url] = None
    return lookups[url]
for ev in events:
    payload = ev.get('payload') or {}
    repo_name = (ev.get('repo') or {}).get('name')
    if ev.get('type') == 'PushEvent' and not payload.get('commits') and payload.get('head') and repo_name:
        commit = lookup(f"{BASE}/repos/{repo_name}/commits/{payload['head']}")
        if commit:
            payload['commits'] = [{'sha': commit['sha'], 'message': commit['commit']['message']}]
            hydrated += 1
    elif ev.get('type') == 'PullRequestEvent':
        pr = payload.get('pull_request') or {}
        if pr.get('url') and not pr.get('title'):
            full = lookup(pr['url'])
            if full:
                pr['title'] = full.get('title')
                hydrated += 1
print(f'  {hydrated} events hydrated ({len(lookups)} API lookups)')

print('Fetching self-starred repos...')
try:
    starred_all = gh_get_all(
        f'{BASE}/users/{USERNAME}/starred?per_page=100'
    )
    # Only own repos that the user has starred = portfolio curation signal
    self_starred = [
        r['name'] for r in starred_all
        if r['owner']['login'] == USERNAME
    ]
    print(f'  {len(self_starred)} own repos self-starred: {self_starred}')
except Exception as exc:
    print(f'  Starred fetch unavailable: {exc}')
    # Keep the last known list. An empty one makes the site fall back to the whole
    # curated list, and this run would publish that as a home-page change.
    try:
        with open('github-data.json', encoding='utf-8') as fh:
            self_starred = json.load(fh).get('selfStarredRepoNames', [])
    except (OSError, ValueError):
        self_starred = []
    print(f'  keeping previous list: {self_starred}')

print('Fetching contribution calendar (GraphQL)...')
CONTRIB_QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}
"""
LEVEL_MAP = {
    'NONE': 0,
    'FIRST_QUARTILE': 1,
    'SECOND_QUARTILE': 2,
    'THIRD_QUARTILE': 3,
    'FOURTH_QUARTILE': 4,
}
try:
    gql = gh_graphql(CONTRIB_QUERY, {'login': USERNAME})
    cal = gql['data']['user']['contributionsCollection']['contributionCalendar']
    contributions = {
        'total': cal['totalContributions'],
        'weeks': [
            {
                'days': [
                    {
                        'date': d['date'],
                        'count': d['contributionCount'],
                        'level': LEVEL_MAP.get(d['contributionLevel'], 0),
                    }
                    for d in week['contributionDays']
                ]
            }
            for week in cal['weeks']
        ],
    }
    print(f'  {contributions["total"]} contributions over {len(contributions["weeks"])} weeks')
except Exception as exc:
    print(f'  Contributions unavailable: {exc}')
    contributions = None

print('Aggregating language bytes (skipping forks/archived)...')
language_bytes = {}
for r in repos:
    if r.get('fork') or r.get('archived'):
        continue
    try:
        langs = gh_get(r['languages_url'])
        for lang, byte_count in langs.items():
            language_bytes[lang] = language_bytes.get(lang, 0) + byte_count
    except Exception as exc:
        print(f"  languages for {r['name']} unavailable: {exc}")
language_bytes = dict(
    sorted(language_bytes.items(), key=lambda kv: kv[1], reverse=True)
)
print(f'  {len(language_bytes)} languages aggregated')

# The site only reads a handful of fields, and github-data.json is fetched on
# every visit, so keep just those. (The README renderer below still sees the
# full repo objects.) If a module starts reading another field, add it here.
REPO_FIELDS = (
    'id', 'name', 'full_name', 'description', 'html_url', 'homepage', 'language',
    'topics', 'stargazers_count', 'forks_count', 'open_issues_count',
    'pushed_at', 'updated_at', 'created_at', 'fork', 'archived',
)
USER_FIELDS = ('login', 'name', 'html_url', 'public_repos', 'followers', 'created_at')

def pick(obj, fields):
    return {k: obj[k] for k in fields if k in obj}

def slim_event(ev):
    payload = ev.get('payload') or {}
    pr = payload.get('pull_request') or {}
    slim_payload = {}
    if payload.get('commits'):
        slim_payload['commits'] = [pick(c, ('sha', 'message')) for c in payload['commits']]
    if payload.get('ref') is not None:
        slim_payload['ref'] = payload['ref']
    if payload.get('ref_type'):
        slim_payload['ref_type'] = payload['ref_type']
    if payload.get('release'):
        slim_payload['release'] = pick(payload['release'], ('tag_name',))
    if pr:
        slim_payload['pull_request'] = {
            'title': pr.get('title'),
            'head': pick(pr.get('head') or {}, ('ref',)),
        }
    return {
        'id': ev.get('id'),
        'type': ev.get('type'),
        'repo': pick(ev.get('repo') or {}, ('name',)),
        'payload': slim_payload,
        'created_at': ev.get('created_at'),
    }

output = {
    'user': pick(user, USER_FIELDS),
    'repositories': [pick(r, REPO_FIELDS) for r in repos],
    'events': [slim_event(ev) for ev in events],
    'selfStarredRepoNames': self_starred,
    'contributions': contributions,
    'languageBytes': language_bytes,
    'lastUpdated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'totalRepos': len(repos),
}

with open('github-data.json', 'w', encoding='utf-8') as fh:
    json.dump(output, fh, indent=2, ensure_ascii=False)
    fh.write('\n')

print(f'github-data.json written ({len(repos)} repos, lastUpdated={output["lastUpdated"]})')

print('Rendering Featured Projects section into README.md...')
EMOJI_BY_LANGUAGE = {
    'TypeScript': '🌐', 'JavaScript': '🌐', 'Python': '🐍', 'Swift': '📱',
    'C++': '🎮', 'HTML': '🖥️', 'Shell': '🐚', 'Rust': '🦀',
}

def featured_candidates(repos):
    skip_names = {'and3rn3t', '.github'}
    picked = []
    for r in repos:
        if r.get('fork') or r.get('archived') or r['name'] in skip_names:
            continue
        if 'inactive' in (r.get('topics') or []):
            continue
        if not r.get('description'):
            continue
        picked.append(r)
    picked.sort(key=lambda r: r['pushed_at'], reverse=True)
    # Repos tagged `featured` (set from workspace-tools' workspace.json)
    # win; fall back to most recently pushed if none are tagged.
    featured = [r for r in picked if 'featured' in (r.get('topics') or [])]
    return (featured or picked)[:8]

def render_card(r):
    emoji = EMOJI_BY_LANGUAGE.get(r.get('language'), '⭐')
    name, desc = r['name'], r['description']
    homepage = (r.get('homepage') or '').strip()
    # The language, then at most two topics. Topics are free-form tags (`bayesian`,
    # `cloudflare-d1`, ...), so showing five of them made the cards read like a tag dump.
    language = r.get('language')
    tech_bits = [language] if language else []
    tech_bits += [
        t for t in (r.get('topics') or [])
        if t != 'featured' and t.lower() != (language or '').lower()
    ][:2]
    tech_line = f"\n>\n> **Tech:** {', '.join(tech_bits)}" if tech_bits else ''
    link_line = f"\n> 🔗 [Live]({homepage})" if homepage else ''
    return (
        f"### {emoji} [{name}](https://github.com/and3rn3t/{name})\n\n"
        f"> {desc}{tech_line}{link_line}\n"
    )

cards = featured_candidates(repos)
block = '\n'.join(render_card(r) for r in cards)

with open('README.md', encoding='utf-8') as fh:
    readme = fh.read()

start_marker = '<!-- FEATURED-PROJECTS:START -->'
end_marker = '<!-- FEATURED-PROJECTS:END -->'
start = readme.find(start_marker)
end = readme.find(end_marker)
if start != -1 and end != -1:
    new_readme = (
        readme[:start + len(start_marker)]
        + '\n\n' + block + '\n'
        + readme[end:]
    )
    if new_readme != readme:
        with open('README.md', 'w', encoding='utf-8') as fh:
            fh.write(new_readme)
        print(f'README.md updated with {len(cards)} featured project(s)')
    else:
        print('README.md featured projects already up to date')
else:
    print('Featured Projects markers not found in README.md — skipping')
