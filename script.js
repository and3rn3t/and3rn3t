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
        // First, try to get user info
        const userResponse = await fetch('https://api.github.com/users/and3rn3t');
        const userData = await userResponse.json();
        
        // Get repositories
        const reposResponse = await fetch('https://api.github.com/users/and3rn3t/repos?sort=updated&per_page=6');
        const repos = await reposResponse.json();
        
        // Filter out fork repositories and select the most interesting ones
        const featuredRepos = repos
            .filter(repo => !repo.fork && repo.description)
            .slice(0, 6);
        
        if (featuredRepos.length === 0) {
            // If no repositories found, show demo projects
            showDemoProjects(projectsGrid);
            return;
        }
        
        // Clear loading state
        projectsGrid.innerHTML = '';
        
        // Create project cards
        featuredRepos.forEach(repo => {
            const projectCard = createProjectCard(repo);
            projectsGrid.appendChild(projectCard);
        });
        
    } catch (error) {
        console.error('Error loading GitHub repositories:', error);
        showDemoProjects(projectsGrid);
    }
}

function createProjectCard(repo) {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    // Get primary language or default
    const language = repo.language || 'Code';
    
    // Format dates
    const updatedDate = new Date(repo.updated_at).toLocaleDateString();
    
    card.innerHTML = `
        <div class="project-header">
            <h3 class="project-title">${repo.name}</h3>
            <p class="project-description">${repo.description || 'A coding project showcasing development skills.'}</p>
            
            <div class="project-stats">
                <div class="project-stat">
                    <i class="fas fa-star"></i>
                    <span>${repo.stargazers_count}</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-code-branch"></i>
                    <span>${repo.forks_count}</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-calendar"></i>
                    <span>${updatedDate}</span>
                </div>
            </div>
            
            <div class="project-languages">
                <span class="language-tag">${language}</span>
                ${repo.topics ? repo.topics.slice(0, 3).map(topic => 
                    `<span class="language-tag">${topic}</span>`
                ).join('') : ''}
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
                    Read More
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