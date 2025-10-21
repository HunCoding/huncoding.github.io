/**
 * Language Detection Script
 * Automatically redirects users to English version if their browser language is not Portuguese
 */

(function() {
    'use strict';

    // Check if we're on the home page and haven't already detected language
    if (window.location.pathname === '/' && !sessionStorage.getItem('languageDetected')) {
        
        // Get browser language
        const browserLang = navigator.language || navigator.userLanguage;
        
        // List of Portuguese language codes
        const portugueseCodes = [
            'pt', 'pt-BR', 'pt-PT', 'pt-AO', 'pt-MZ', 'pt-CV', 'pt-GW', 'pt-ST', 'pt-TL'
        ];
        
        // Check if browser language is Portuguese
        const isPortuguese = portugueseCodes.some(code => 
            browserLang.toLowerCase().startsWith(code.toLowerCase())
        );
        
        // If not Portuguese, redirect to English version
        if (!isPortuguese) {
            // Mark as detected to prevent infinite redirects
            sessionStorage.setItem('languageDetected', 'true');
            
            // Redirect to English version
            window.location.href = '/en/';
        } else {
            // Mark as detected for Portuguese users too
            sessionStorage.setItem('languageDetected', 'true');
        }
    }
    
    // Clear detection flag when user manually navigates to home
    if (window.location.pathname === '/') {
        // Check if user came from English page (manual navigation)
        if (document.referrer.includes('/en/')) {
            sessionStorage.removeItem('languageDetected');
        }
    }
})();
