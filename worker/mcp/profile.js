/**
 * The about-Matthew tools: who Matthew is, and the work history. Read from the site's own
 * experience-data.json (site-data.js).
 *
 * Workers-compatible: no Node built-ins.
 */

import { SITE_ORIGIN, loadExperience } from '../site-data.js';
import { OUTPUT, asData } from './shared.js';

/** @param {{ env: object, registerTool: Function }} context */
export function registerProfile({ env, registerTool }) {
    registerTool(
        'get_profile',
        {
            title: 'About Matthew Anderson',
            description:
                'Who Matthew Anderson (and3rn3t) is: current role, what Matthew builds, and where to find Matthew online and on this site.',
            outputSchema: OUTPUT.profile,
        },
        async () => {
            const { experience } = await loadExperience(env);
            const current = experience.find(job => job.current) ?? experience[0];
            return asData({
                name: 'Matthew Anderson',
                handle: 'and3rn3t',
                role: current ? `${current.role} at ${current.company}` : null,
                about: 'A software engineer who builds health tech, home automation and data tools in spare time, mostly in TypeScript, Swift and Python.',
                site: `${SITE_ORIGIN}/`,
                llms_txt: `${SITE_ORIGIN}/llms.txt`,
                github: 'https://github.com/and3rn3t',
                linkedin: 'https://linkedin.com/in/and3rn3t',
                email: 'and3rn3t@icloud.com',
            });
        }
    );
}

/** @param {{ env: object, registerTool: Function }} context */
export function registerExperience({ env, registerTool }) {
    registerTool(
        'list_experience',
        {
            title: 'Work history and education',
            description:
                "Matthew Anderson's work history and education, newest first, with what each role involved.",
            outputSchema: OUTPUT.experience,
        },
        async () => {
            const { experience, education } = await loadExperience(env);
            return asData({
                experience: experience.map(job => ({
                    role: job.role,
                    company: job.company,
                    from: job.startDate,
                    to: job.current ? 'present' : job.endDate,
                    summary: job.summary,
                    highlights: job.highlights,
                    technologies: job.technologies,
                })),
                education: education.map(school => ({
                    degree: school.degree,
                    institution: school.institution,
                    from: school.startDate,
                    to: school.endDate,
                    highlights: school.highlights,
                })),
            });
        }
    );
}
