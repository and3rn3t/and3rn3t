// Smooth scrolling and navigation
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');

    mobileMenu.addEventListener('click', function() {
        mobileMenu.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offsetTop = target.offsetTop - 70; // Account for fixed navbar
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Load GitHub repositories
    loadGitHubProjects();
    loadGitHubStats();
    loadGitHubActivity();
    loadGitHubBadges();
    loadPinnedRepos();
    loadTopicsCloud();
    loadGitHubGists();

    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.highlight-item, .skill-category, .project-card');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// GitHub API integration
async function loadGitHubProjects() {
    const projectsGrid = document.getElementById('projects-grid');
    
    try {
        // Load project metadata
        let projectsData = null;
        try {
            const projectsDataResponse = await fetch('projects-data.json');
            projectsData = await projectsDataResponse.json();
        } catch (e) {
            console.log('Project data file not found, using API data only');
        }
        
        // First, try to get user info
        const userResponse = await fetch('https://api.github.com/users/and3rn3t');
        const userData = await userResponse.json();
        
        // Get repositories sorted by stars to show top projects
        const reposResponse = await fetch('https://api.github.com/users/and3rn3t/repos?sort=stars&per_page=100');
        const repos = await reposResponse.json();
        
        // Filter out fork repositories and archived, then sort by stars
        const featuredRepos = repos
            .filter(repo => !repo.fork && !repo.archived)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 9);
        
        if (featuredRepos.length === 0) {
            // If no repositories found, show demo projects
            showDemoProjects(projectsGrid);
            return;
        }
        
        // Clear loading state
        projectsGrid.innerHTML = '';
        
        // Create project cards with enhanced data
        featuredRepos.forEach(repo => {
            const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
            const projectCard = createProjectCard(repo, projectMeta);
            projectsGrid.appendChild(projectCard);
        });
        
    } catch (error) {
        console.error('Error loading GitHub repositories:', error);
        showDemoProjects(projectsGrid);
    }
}

function createProjectCard(repo, metadata) {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    // Use metadata if available, otherwise fall back to repo data
    const displayName = metadata?.displayName || repo.name;
    const description = metadata?.description || repo.description || 'A coding project showcasing development skills.';
    const longDescription = metadata?.longDescription;
    const category = metadata?.category;
    const status = metadata?.status;
    
    // Get primary language or default
    const language = repo.language || 'Code';
    
    // Format dates
    const updatedDate = new Date(repo.updated_at).toLocaleDateString();
    
    // Determine if we have enough stars to show it prominently
    const isTopProject = repo.stargazers_count > 0;
    
    card.innerHTML = `
        <div class="project-header">
            ${category ? `<span class="project-category">${category}</span>` : ''}
            <h3 class="project-title">${displayName}</h3>
            <p class="project-description">${description}</p>
            ${longDescription ? `
                <details class="project-long-description">
                    <summary>Learn more about this project...</summary>
                    <p>${longDescription}</p>
                    ${metadata?.highlights ? `
                        <ul class="project-highlights">
                            ${metadata.highlights.map(highlight => `<li>${highlight}</li>`).join('')}
                        </ul>
                    ` : ''}
                </details>
            ` : ''}
            
            <div class="project-stats">
                <div class="project-stat" title="Stars">
                    <i class="fas fa-star"></i>
                    <span>${repo.stargazers_count}</span>
                </div>
                <div class="project-stat" title="Forks">
                    <i class="fas fa-code-branch"></i>
                    <span>${repo.forks_count}</span>
                </div>
                <div class="project-stat" title="Open Issues">
                    <i class="fas fa-circle-dot"></i>
                    <span>${repo.open_issues_count}</span>
                </div>
                <div class="project-stat" title="Last Updated">
                    <i class="fas fa-calendar"></i>
                    <span>${updatedDate}</span>
                </div>
            </div>
            
            <div class="project-languages">
                <span class="language-tag primary">${language}</span>
                ${repo.topics ? repo.topics.slice(0, 3).map(topic => 
                    `<span class="language-tag">${topic}</span>`
                ).join('') : ''}
                ${status ? `<span class="status-badge ${status.toLowerCase().replace(/\s+/g, '-')}">${status}</span>` : ''}
            </div>
        </div>
        
        <div class="project-links">
            <a href="${repo.html_url}" target="_blank" class="project-link">
                <i class="fab fa-github"></i>
                View Code
            </a>
            ${repo.homepage ? `
                <a href="${repo.homepage}" target="_blank" class="project-link secondary">
                    <i class="fas fa-external-link-alt"></i>
                    Live Demo
                </a>
            ` : `
                <a href="${repo.html_url}/blob/main/README.md" target="_blank" class="project-link secondary">
                    <i class="fas fa-file-alt"></i>
                    Documentation
                </a>
            `}
        </div>
    `;
    
    return card;
}

function showDemoProjects(container) {
    const demoProjects = [
        {
            name: "Smart Home Dashboard",
            description: "A comprehensive home automation dashboard built with React and Python, featuring real-time IoT device monitoring and control.",
            language: "React",
            topics: ["IoT", "Python", "Dashboard"],
            stars: 15,
            forks: 3,
            updated: "2024-01-15",
            github: "https://github.com/and3rn3t",
            demo: null
        },
        {
            name: "Full-Stack E-Commerce",
            description: "Modern e-commerce platform with React frontend, Node.js backend, and PostgreSQL database. Features include user authentication and payment processing.",
            language: "JavaScript",
            topics: ["React", "Node.js", "PostgreSQL"],
            stars: 23,
            forks: 7,
            updated: "2024-01-10",
            github: "https://github.com/and3rn3t",
            demo: "#"
        },
        {
            name: "Python Data Analyzer",
            description: "Advanced data analysis tool built with Python, featuring data visualization, statistical analysis, and machine learning capabilities.",
            language: "Python",
            topics: ["Data Science", "ML", "Visualization"],
            stars: 31,
            forks: 12,
            updated: "2024-01-05",
            github: "https://github.com/and3rn3t",
            demo: null
        }
    ];
    
    container.innerHTML = '';
    
    demoProjects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        card.innerHTML = `
            <div class="project-header">
                <h3 class="project-title">${project.name}</h3>
                <p class="project-description">${project.description}</p>
                
                <div class="project-stats">
                    <div class="project-stat">
                        <i class="fas fa-star"></i>
                        <span>${project.stars}</span>
                    </div>
                    <div class="project-stat">
                        <i class="fas fa-code-branch"></i>
                        <span>${project.forks}</span>
                    </div>
                    <div class="project-stat">
                        <i class="fas fa-calendar"></i>
                        <span>${new Date(project.updated).toLocaleDateString()}</span>
                    </div>
                </div>
                
                <div class="project-languages">
                    <span class="language-tag">${project.language}</span>
                    ${project.topics.map(topic => 
                        `<span class="language-tag">${topic}</span>`
                    ).join('')}
                </div>
            </div>
            
            <div class="project-links">
                <a href="${project.github}" target="_blank" class="project-link">
                    <i class="fab fa-github"></i>
                    View Code
                </a>
                ${project.demo ? `
                    <a href="${project.demo}" target="_blank" class="project-link secondary">
                        <i class="fas fa-external-link-alt"></i>
                        Live Demo
                    </a>
                ` : `
                    <a href="${project.github}" target="_blank" class="project-link secondary">
                        <i class="fas fa-file-alt"></i>
                        Learn More
                    </a>
                `}
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Enhanced scroll animations
function initScrollAnimations() {
    const animationElements = document.querySelectorAll('.hero-content, .about-text, .skills-grid');
    
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, {
        threshold: 0.1
    });
    
    animationElements.forEach(el => {
        animationObserver.observe(el);
    });
}

// Typing effect for hero section
function initTypingEffect() {
    const texts = [
        "Full-Stack Developer",
        "Technology Enthusiast", 
        "IoT Specialist",
        "Problem Solver"
    ];
    
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const typingSpeed = 100;
    const deletingSpeed = 50;
    const pauseDuration = 2000;
    
    const heroSubtitle = document.querySelector('.hero-subtitle');
    
    function typeEffect() {
        const currentText = texts[textIndex];
        
        if (isDeleting) {
            heroSubtitle.textContent = currentText.substring(0, charIndex - 1);
            charIndex--;
        } else {
            heroSubtitle.textContent = currentText.substring(0, charIndex + 1);
            charIndex++;
        }
        
        let timeout = isDeleting ? deletingSpeed : typingSpeed;
        
        if (!isDeleting && charIndex === currentText.length) {
            timeout = pauseDuration;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
        }
        
        setTimeout(typeEffect, timeout);
    }
    
    // Start typing effect after a short delay
    setTimeout(typeEffect, 1000);
}

// Enhanced project loading with error handling
function enhancedProjectLoad() {
    const projectsGrid = document.getElementById('projects-grid');
    
    // Add retry functionality
    let retryCount = 0;
    const maxRetries = 3;
    
    async function loadWithRetry() {
        try {
            await loadGitHubProjects();
        } catch (error) {
            retryCount++;
            if (retryCount < maxRetries) {
                console.log(`Retry ${retryCount} for loading projects...`);
                setTimeout(loadWithRetry, 2000 * retryCount);
            } else {
                console.error('Failed to load projects after multiple attempts');
                showDemoProjects(projectsGrid);
            }
        }
    }
    
    loadWithRetry();
}

// Initialize enhanced features when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initScrollAnimations();
    initTypingEffect();
    
    // Add some interactive features
    const skillItems = document.querySelectorAll('.skill-item');
    skillItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px) scale(1.05)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // Add parallax effect to hero section
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.hero');
        
        parallaxElements.forEach(element => {
            const speed = 0.5;
            element.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });
});

// Contact form handling (if needed in the future)
function handleContactForm() {
    const contactMethods = document.querySelectorAll('.contact-method');
    
    contactMethods.forEach(method => {
        method.addEventListener('click', function(e) {
            // Add click tracking or analytics here if needed
            console.log('Contact method clicked:', this.href);
        });
    });
}

// Initialize contact handling
document.addEventListener('DOMContentLoaded', handleContactForm);

// GitHub Stats Integration
async function loadGitHubStats() {
    const statsGrid = document.getElementById('stats-grid');
    const contributionGraph = document.getElementById('contribution-graph');
    const languageStats = document.getElementById('language-stats');
    
    try {
        // Fetch user data
        const userResponse = await fetch('https://api.github.com/users/and3rn3t');
        const userData = await userResponse.json();
        
        // Fetch repositories for additional stats
        const reposResponse = await fetch('https://api.github.com/users/and3rn3t/repos?per_page=100');
        const repos = await reposResponse.json();
        
        // Calculate total stars and forks
        const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
        
        // Display stats
        statsGrid.innerHTML = `
            <div class="stat-card">
                <i class="fas fa-code-branch"></i>
                <div class="stat-content">
                    <h3>${userData.public_repos}</h3>
                    <p>Public Repositories</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-users"></i>
                <div class="stat-content">
                    <h3>${userData.followers}</h3>
                    <p>Followers</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-user-friends"></i>
                <div class="stat-content">
                    <h3>${userData.following}</h3>
                    <p>Following</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-star"></i>
                <div class="stat-content">
                    <h3>${totalStars}</h3>
                    <p>Total Stars</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-code-branch"></i>
                <div class="stat-content">
                    <h3>${totalForks}</h3>
                    <p>Total Forks</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-download"></i>
                <div class="stat-content">
                    <h3>${userData.public_gists}</h3>
                    <p>Public Gists</p>
                </div>
            </div>
        `;
        
        // Load language statistics
        loadLanguageStats(repos);
        
        // Load contribution graph (using GitHub readme stats API)
        contributionGraph.innerHTML = `
            <div class="contribution-widget">
                <img src="https://ghchart.rshah.org/f5576c/and3rn3t" alt="GitHub Contribution Graph" />
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading GitHub stats:', error);
        statsGrid.innerHTML = '<p class="error-message">Unable to load GitHub statistics at this time.</p>';
        contributionGraph.innerHTML = '';
        languageStats.innerHTML = '';
    }
}

// Load language statistics
function loadLanguageStats(repos) {
    const languageStats = document.getElementById('language-stats');
    
    // Count languages across all repos
    const languages = {};
    repos.forEach(repo => {
        if (repo.language) {
            languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
    });
    
    // Sort by count
    const sortedLanguages = Object.entries(languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    
    const total = sortedLanguages.reduce((sum, [, count]) => sum + count, 0);
    
    // Language colors
    const languageColors = {
        'JavaScript': '#f1e05a',
        'Python': '#3572A5',
        'HTML': '#e34c26',
        'CSS': '#563d7c',
        'TypeScript': '#2b7489',
        'Java': '#b07219',
        'Go': '#00ADD8',
        'Ruby': '#701516',
        'PHP': '#4F5D95',
        'C++': '#f34b7d',
        'C': '#555555',
        'Shell': '#89e051',
        'C#': '#178600',
        'Swift': '#ffac45',
        'Kotlin': '#F18E33',
        'Rust': '#dea584'
    };
    
    languageStats.innerHTML = `
        <div class="language-bars">
            ${sortedLanguages.map(([language, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                const color = languageColors[language] || '#8b949e';
                return `
                    <div class="language-item">
                        <div class="language-info">
                            <span class="language-name">
                                <span class="language-dot" style="background-color: ${color}"></span>
                                ${language}
                            </span>
                            <span class="language-percentage">${percentage}%</span>
                        </div>
                        <div class="language-bar">
                            <div class="language-bar-fill" style="width: ${percentage}%; background-color: ${color}"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Load recent GitHub activity
async function loadGitHubActivity() {
    const activityFeed = document.getElementById('activity-feed');
    
    try {
        // Fetch recent events
        const eventsResponse = await fetch('https://api.github.com/users/and3rn3t/events/public?per_page=10');
        const events = await eventsResponse.json();
        
        if (events.length === 0) {
            activityFeed.innerHTML = '<p class="no-activity">No recent activity to display.</p>';
            return;
        }
        
        // Display activity items
        const activityItems = events.slice(0, 8).map(event => {
            const date = new Date(event.created_at);
            const timeAgo = getTimeAgo(date);
            
            let icon = 'fa-code';
            let action = '';
            let details = '';
            
            switch(event.type) {
                case 'PushEvent':
                    icon = 'fa-code-commit';
                    const commits = event.payload.commits?.length || 0;
                    action = `Pushed ${commits} commit${commits !== 1 ? 's' : ''} to`;
                    details = event.repo.name;
                    break;
                case 'CreateEvent':
                    icon = 'fa-plus-circle';
                    action = `Created ${event.payload.ref_type}`;
                    details = event.repo.name;
                    break;
                case 'WatchEvent':
                    icon = 'fa-star';
                    action = 'Starred';
                    details = event.repo.name;
                    break;
                case 'ForkEvent':
                    icon = 'fa-code-branch';
                    action = 'Forked';
                    details = event.repo.name;
                    break;
                case 'IssuesEvent':
                    icon = 'fa-circle-dot';
                    action = `${event.payload.action} issue in`;
                    details = event.repo.name;
                    break;
                case 'PullRequestEvent':
                    icon = 'fa-code-pull-request';
                    action = `${event.payload.action} pull request in`;
                    details = event.repo.name;
                    break;
                default:
                    icon = 'fa-circle';
                    action = event.type.replace('Event', '');
                    details = event.repo.name;
            }
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <p class="activity-action">${action} <strong>${details}</strong></p>
                        <span class="activity-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        activityFeed.innerHTML = `<div class="activity-list">${activityItems}</div>`;
        
    } catch (error) {
        console.error('Error loading GitHub activity:', error);
        activityFeed.innerHTML = '<p class="error-message">Unable to load recent activity.</p>';
    }
}

// Helper function to calculate time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}

// Load GitHub profile badges
function loadGitHubBadges() {
    const badgesGrid = document.getElementById('badges-grid');
    
    const badges = [
        {
            name: 'Profile Views',
            url: 'https://komarev.com/ghpvc/?username=and3rn3t&style=for-the-badge&color=blueviolet',
            alt: 'Profile views counter'
        },
        {
            name: 'GitHub Stats',
            url: 'https://github-readme-stats.vercel.app/api?username=and3rn3t&show_icons=true&theme=radical&hide_border=true',
            alt: 'GitHub stats card'
        },
        {
            name: 'Top Languages',
            url: 'https://github-readme-stats.vercel.app/api/top-langs/?username=and3rn3t&layout=compact&theme=radical&hide_border=true',
            alt: 'Top languages card'
        },
        {
            name: 'GitHub Streak',
            url: 'https://github-readme-streak-stats.herokuapp.com/?user=and3rn3t&theme=radical&hide_border=true',
            alt: 'GitHub streak stats'
        },
        {
            name: 'Contribution Graph',
            url: 'https://github-readme-activity-graph.vercel.app/graph?username=and3rn3t&theme=react-dark&hide_border=true',
            alt: 'Activity graph'
        },
        {
            name: 'GitHub Trophies',
            url: 'https://github-profile-trophy.vercel.app/?username=and3rn3t&theme=radical&no-frame=true&no-bg=false&margin-w=4',
            alt: 'GitHub trophies'
        }
    ];
    
    badgesGrid.innerHTML = badges.map(badge => `
        <div class="badge-card">
            <h3 class="badge-title">${badge.name}</h3>
            <div class="badge-image">
                <img src="${badge.url}" alt="${badge.alt}" loading="lazy" />
            </div>
        </div>
    `).join('');
}

// Load pinned repositories
async function loadPinnedRepos() {
    const pinnedRepos = document.getElementById('pinned-repos');
    
    try {
        // Fetch all repos and sort by stars to simulate pinned repos
        const reposResponse = await fetch('https://api.github.com/users/and3rn3t/repos?sort=stars&per_page=100');
        const repos = await reposResponse.json();
        
        // Get top starred repositories that are not forks
        const topRepos = repos
            .filter(repo => !repo.fork)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 6);
        
        if (topRepos.length === 0) {
            pinnedRepos.innerHTML = '<p class="no-activity">No pinned repositories to display.</p>';
            return;
        }
        
        pinnedRepos.innerHTML = topRepos.map(repo => `
            <div class="pinned-repo-card">
                <div class="pinned-repo-header">
                    <i class="fas fa-book"></i>
                    <a href="${repo.html_url}" target="_blank" class="pinned-repo-name">${repo.name}</a>
                </div>
                <p class="pinned-repo-desc">${repo.description || 'No description available'}</p>
                <div class="pinned-repo-footer">
                    <div class="pinned-repo-stats">
                        ${repo.language ? `<span class="repo-language"><span class="language-dot"></span>${repo.language}</span>` : ''}
                        <span class="repo-stat"><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                        <span class="repo-stat"><i class="fas fa-code-branch"></i> ${repo.forks_count}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading pinned repos:', error);
        pinnedRepos.innerHTML = '<p class="error-message">Unable to load pinned repositories.</p>';
    }
}

// Load topics cloud
async function loadTopicsCloud() {
    const topicsCloud = document.getElementById('topics-cloud');
    
    try {
        const reposResponse = await fetch('https://api.github.com/users/and3rn3t/repos?per_page=100');
        const repos = await reposResponse.json();
        
        // Collect all topics
        const topicsCount = {};
        repos.forEach(repo => {
            if (repo.topics && repo.topics.length > 0) {
                repo.topics.forEach(topic => {
                    topicsCount[topic] = (topicsCount[topic] || 0) + 1;
                });
            }
        });
        
        // Sort by frequency
        const sortedTopics = Object.entries(topicsCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);
        
        if (sortedTopics.length === 0) {
            topicsCloud.innerHTML = '<p class="no-activity">No topics to display.</p>';
            return;
        }
        
        // Calculate size based on frequency
        const maxCount = sortedTopics[0][1];
        
        topicsCloud.innerHTML = `
            <div class="topics-list">
                ${sortedTopics.map(([topic, count]) => {
                    const size = Math.max(0.8, Math.min(2, count / maxCount * 2));
                    return `<span class="topic-tag" style="font-size: ${size}rem">${topic} (${count})</span>`;
                }).join('')}
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading topics:', error);
        topicsCloud.innerHTML = '<p class="error-message">Unable to load topics.</p>';
    }
}

// Load GitHub Gists
async function loadGitHubGists() {
    const gistsGrid = document.getElementById('gists-grid');
    
    try {
        const gistsResponse = await fetch('https://api.github.com/users/and3rn3t/gists?per_page=6');
        const gists = await gistsResponse.json();
        
        if (gists.length === 0) {
            gistsGrid.innerHTML = '<p class="no-activity">No public gists to display.</p>';
            return;
        }
        
        gistsGrid.innerHTML = gists.map(gist => {
            const files = Object.values(gist.files);
            const firstFile = files[0];
            const fileCount = files.length;
            const createdDate = new Date(gist.created_at).toLocaleDateString();
            
            return `
                <div class="gist-card">
                    <div class="gist-header">
                        <i class="fas fa-code"></i>
                        <a href="${gist.html_url}" target="_blank" class="gist-title">
                            ${firstFile.filename}
                        </a>
                    </div>
                    <p class="gist-description">${gist.description || 'No description provided'}</p>
                    <div class="gist-footer">
                        <span class="gist-language">${firstFile.language || 'Text'}</span>
                        ${fileCount > 1 ? `<span class="gist-files">${fileCount} files</span>` : ''}
                        <span class="gist-date">${createdDate}</span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading gists:', error);
        gistsGrid.innerHTML = '<p class="error-message">Unable to load gists.</p>';
    }
}
// Theme Toggle Functionality
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const icon = themeToggle.querySelector('i');
    
    // Check for saved theme preference or default to light mode
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    updateThemeIcon(icon, currentTheme);
    
    themeToggle.addEventListener('click', function() {
        const isDark = document.body.classList.toggle('dark-theme');
        const theme = isDark ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        updateThemeIcon(icon, theme);
    });
}

function updateThemeIcon(icon, theme) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Initialize theme toggle
document.addEventListener('DOMContentLoaded', function() {
    initThemeToggle();
});

// Add stagger animation to project cards
function animateProjectCards() {
    const cards = document.querySelectorAll('.project-card');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
        card.classList.add('fade-in-up');
    });
}

// Call after projects are loaded
const originalLoadGitHubProjects = loadGitHubProjects;
loadGitHubProjects = async function() {
    await originalLoadGitHubProjects();
    animateProjectCards();
};

// Enhanced keyboard navigation
document.addEventListener('keydown', function(e) {
    // Press 'T' to toggle theme
    if (e.key === 't' || e.key === 'T') {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            themeToggle.click();
        }
    }
});

// Add print functionality (Ctrl/Cmd + P for resume-style print)
window.addEventListener('beforeprint', function() {
    document.body.classList.add('printing');
});

window.addEventListener('afterprint', function() {
    document.body.classList.remove('printing');
});

// Performance optimization: Lazy load images
function lazyLoadImages() {
    const images = document.querySelectorAll('img[loading="lazy"]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    observer.unobserve(img);
                }
            });
        });
        
        images.forEach(img => imageObserver.observe(img));
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', lazyLoadImages);

// Add smooth scroll behavior for all internal links
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});

// Add analytics event tracking (placeholder for future integration)
function trackEvent(category, action, label) {
    // This can be integrated with Google Analytics, Plausible, or other analytics services
    console.log('Event tracked:', { category, action, label });
}

// Track project card clicks
document.addEventListener('click', function(e) {
    const projectLink = e.target.closest('.project-link');
    if (projectLink) {
        const projectCard = projectLink.closest('.project-card');
        const projectTitle = projectCard?.querySelector('.project-title')?.textContent;
        trackEvent('Project', 'Click', projectTitle);
    }
});

// Load Top Starred Projects with detailed stats
async function loadTopStarredProjects() {
    const topProjectsStats = document.getElementById('top-projects-stats');
    
    try {
        // Load project metadata
        let projectsData = null;
        try {
            const projectsDataResponse = await fetch('projects-data.json');
            projectsData = await projectsDataResponse.json();
        } catch (e) {
            console.log('Project data file not found');
        }
        
        // Get repositories sorted by stars
        const reposResponse = await fetch('https://api.github.com/users/and3rn3t/repos?sort=stars&per_page=100');
        const repos = await reposResponse.json();
        
        // Get top 3 starred non-fork, non-archived repositories
        const topRepos = repos
            .filter(repo => !repo.fork && !repo.archived && repo.stargazers_count > 0)
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, 3);
        
        if (topRepos.length === 0) {
            topProjectsStats.innerHTML = '<p class="no-activity">No starred projects to highlight yet.</p>';
            return;
        }
        
        // Calculate total stats
        const totalStars = topRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        const totalForks = topRepos.reduce((sum, repo) => sum + repo.forks_count, 0);
        
        topProjectsStats.innerHTML = `
            <div class="top-projects-summary">
                <div class="summary-stat">
                    <i class="fas fa-star"></i>
                    <div class="stat-info">
                        <h4>${totalStars}</h4>
                        <p>Total Stars</p>
                    </div>
                </div>
                <div class="summary-stat">
                    <i class="fas fa-code-branch"></i>
                    <div class="stat-info">
                        <h4>${totalForks}</h4>
                        <p>Total Forks</p>
                    </div>
                </div>
                <div class="summary-stat">
                    <i class="fas fa-trophy"></i>
                    <div class="stat-info">
                        <h4>${topRepos.length}</h4>
                        <p>Top Projects</p>
                    </div>
                </div>
            </div>
            
            <div class="top-projects-list">
                ${topRepos.map((repo, index) => {
                    const projectMeta = projectsData?.projects?.find(p => p.name === repo.name);
                    const displayName = projectMeta?.displayName || repo.name;
                    const description = projectMeta?.longDescription || repo.description || 'No description available';
                    const category = projectMeta?.category || 'Development';
                    const technologies = projectMeta?.technologies || [repo.language].filter(Boolean);
                    
                    return `
                        <div class="top-project-card">
                            <div class="rank-badge">#${index + 1}</div>
                            <div class="top-project-content">
                                <div class="top-project-header">
                                    <span class="project-category-badge">${category}</span>
                                    <h4 class="top-project-title">
                                        <a href="${repo.html_url}" target="_blank">${displayName}</a>
                                    </h4>
                                </div>
                                <p class="top-project-description">${description}</p>
                                
                                ${projectMeta?.highlights ? `
                                    <div class="top-project-highlights">
                                        <strong>Key Features:</strong>
                                        <ul>
                                            ${projectMeta.highlights.slice(0, 3).map(h => `<li>${h}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                
                                <div class="top-project-tech">
                                    <strong>Technologies:</strong>
                                    ${technologies.slice(0, 5).map(tech => 
                                        `<span class="tech-badge">${tech}</span>`
                                    ).join('')}
                                </div>
                                
                                <div class="top-project-stats">
                                    <span class="stat-badge">
                                        <i class="fas fa-star"></i> ${repo.stargazers_count} stars
                                    </span>
                                    <span class="stat-badge">
                                        <i class="fas fa-code-branch"></i> ${repo.forks_count} forks
                                    </span>
                                    <span class="stat-badge">
                                        <i class="fas fa-circle-dot"></i> ${repo.open_issues_count} issues
                                    </span>
                                    <span class="stat-badge">
                                        <i class="fas fa-clock"></i> Updated ${new Date(repo.updated_at).toLocaleDateString()}
                                    </span>
                                </div>
                                
                                <div class="top-project-links">
                                    <a href="${repo.html_url}" target="_blank" class="btn btn-primary btn-sm">
                                        <i class="fab fa-github"></i> View Repository
                                    </a>
                                    ${repo.homepage ? `
                                        <a href="${repo.homepage}" target="_blank" class="btn btn-secondary btn-sm">
                                            <i class="fas fa-external-link-alt"></i> Live Demo
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading top starred projects:', error);
        topProjectsStats.innerHTML = '<p class="error-message">Unable to load top projects at this time.</p>';
    }
}

// Update the DOMContentLoaded event to include top projects
document.addEventListener('DOMContentLoaded', function() {
    loadTopStarredProjects();
});
