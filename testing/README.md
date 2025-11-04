# Testing Directory

This directory contains test files used during development and debugging of the portfolio website.

## Test Files

### HTML Test Files

- **`test-simple.html`** - Basic portfolio functionality test without external dependencies
  - Tests JavaScript loading and basic API functionality
  - Minimal setup for quick debugging

- **`test-direct.html`** - Direct GitHub API testing with dark theme
  - Tests GitHub statistics loading
  - Language statistics testing
  - Dark theme styling preview

- **`test-github.html`** - GitHub API integration testing
  - Debug output for API calls
  - Statistics grid testing
  - Error handling verification

- **`test-cloudflare-analytics.html`** - Cloudflare Analytics testing page
  - Analytics beacon loading tests
  - DNS resolution verification
  - Certificate validation checks

### PowerShell Scripts

- **`test-dns.ps1`** - DNS testing utility
  - Quick commands for DNS verification after changes
  - Domain resolution testing

## Usage

These files are for development and testing purposes only. They are not part of the production portfolio and should not be deployed to the live site.

### Running Tests

1. Start a local HTTP server from the root directory:

   ```bash
   python -m http.server 8000
   ```

2. Navigate to individual test files:
   - `http://localhost:8000/testing/test-simple.html`
   - `http://localhost:8000/testing/test-github.html`
   - etc.

### Test Scenarios

- **API Integration**: Use `test-github.html` to verify GitHub API calls
- **Basic Functionality**: Use `test-simple.html` for minimal testing
- **Analytics**: Use `test-cloudflare-analytics.html` when debugging Cloudflare issues
- **DNS Issues**: Run `test-dns.ps1` for domain resolution testing

## Cleanup

These files can be safely removed once development is complete, or kept for future debugging needs.
