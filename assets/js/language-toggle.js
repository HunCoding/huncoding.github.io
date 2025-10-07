/**
 * Language Toggle System
 * Allows switching between Portuguese and English without creating multiple files
 */

class LanguageToggle {
  constructor() {
    this.currentLang = this.getCurrentLanguage();
    this.targetLang = this.currentLang === 'pt-BR' ? 'en' : 'pt-BR';
    this.translations = {};
    this.init();
  }

  init() {
    try {
      this.loadTranslations();
      this.setupEventListeners();
      this.updateLanguageDisplay();
      
      // Apply initial translations if needed
      if (this.currentLang !== 'pt-BR') {
        this.applyTranslations();
      }
    } catch (error) {
      console.error('Error initializing language toggle:', error);
      // Fallback to default language
      this.currentLang = 'pt-BR';
      this.targetLang = 'en';
    }
  }

  getCurrentLanguage() {
    // Get language from URL parameter, localStorage, or default to site language
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    
    if (urlLang && (urlLang === 'pt-BR' || urlLang === 'en')) {
      return urlLang;
    }

    const storedLang = localStorage.getItem('preferred-language');
    if (storedLang && (storedLang === 'pt-BR' || storedLang === 'en')) {
      return storedLang;
    }

    // Default to Portuguese (site default)
    return 'pt-BR';
  }

  loadTranslations() {
    // Load translations from the page data
    const pageData = window.pageData || {};
    this.translations = pageData.translations || {};
  }

  setupEventListeners() {
    const toggleButton = document.getElementById('language-toggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.toggleLanguage();
      });
    }
  }

  updateLanguageDisplay() {
    const currentLangSpan = document.getElementById('current-lang');
    if (currentLangSpan) {
      currentLangSpan.textContent = this.currentLang.toUpperCase();
    }

    // Update button title
    const toggleButton = document.getElementById('language-toggle');
    if (toggleButton) {
      const title = this.currentLang === 'pt-BR' ? 'Switch to English' : 'Mudar para Português';
      toggleButton.setAttribute('title', title);
    }
  }

  toggleLanguage() {
    try {
      const toggleButton = document.getElementById('language-toggle');
      
      // Add switching animation
      if (toggleButton) {
        toggleButton.classList.add('switching');
      }
      
      // Small delay for animation
      setTimeout(() => {
        try {
          this.currentLang = this.targetLang;
          this.targetLang = this.currentLang === 'pt-BR' ? 'en' : 'pt-BR';
          
          // Save preference
          localStorage.setItem('preferred-language', this.currentLang);
          
          // Update display
          this.updateLanguageDisplay();
          
          // Apply translations
          this.applyTranslations();
          
          // Update URL without page reload
          this.updateURL();
          
          // Remove animation class and add pulse effect
          if (toggleButton) {
            toggleButton.classList.remove('switching');
            toggleButton.classList.add('new-language');
            
            // Remove pulse effect after animation
            setTimeout(() => {
              toggleButton.classList.remove('new-language');
            }, 600);
          }
          
          // Show success feedback
          this.showLanguageChangeFeedback();
        } catch (error) {
          console.error('Error during language toggle:', error);
          // Restore original content on error
          this.restoreOriginalContent();
        }
      }, 150);
    } catch (error) {
      console.error('Error in toggleLanguage:', error);
    }
  }

  showLanguageChangeFeedback() {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, rgba(75, 51, 187, 0.95), rgba(139, 92, 246, 0.95));
      color: white;
      padding: 0.875rem 1.25rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 9999;
      opacity: 0;
      transform: translateX(100%) scale(0.9);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(75, 51, 187, 0.3);
    `;
    
    const langName = this.currentLang === 'pt-BR' ? 'Português' : 'English';
    const flag = this.currentLang === 'pt-BR' ? '🇧🇷' : '🇺🇸';
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 1.1em;">${flag}</span>
        <span>Idioma alterado para: <strong>${langName}</strong></span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0) scale(1)';
    }, 10);
    
    // Remove after 2.5 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%) scale(0.9)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 400);
    }, 2500);
  }

  applyTranslations() {
    // Translate page title
    this.translateElement('h1', 'title');
    
    // Translate subtitle/description
    this.translateElement('.post-desc', 'subtitle');
    
    // Translate post content
    this.translatePostContent();
    
    // Translate UI elements
    this.translateUIElements();
    
    // Update page language attribute
    document.documentElement.lang = this.currentLang;
  }

  restoreOriginalContent() {
    const contentElement = document.querySelector('.content');
    if (contentElement && contentElement.dataset.originalContent) {
      contentElement.innerHTML = contentElement.dataset.originalContent;
      this.reinitializeInteractiveElements();
    }
  }

  translateElement(selector, key) {
    const element = document.querySelector(selector);
    if (element && this.translations[key]) {
      const translation = this.translations[key][this.currentLang];
      if (translation) {
        // Store original content if not already stored
        if (!element.dataset.originalText) {
          element.dataset.originalText = element.textContent;
        }
        element.textContent = translation;
      }
    }
  }

  translatePostContent() {
    const contentElement = document.querySelector('.content');
    if (!contentElement || !this.translations.content) {
      return;
    }

    const translation = this.translations.content[this.currentLang];
    if (translation) {
      // Store original content if not already stored
      if (!contentElement.dataset.originalContent) {
        contentElement.dataset.originalContent = contentElement.innerHTML;
      }
      
      // Replace content with translated version
      contentElement.innerHTML = this.processMarkdown(translation);
      
      // Re-initialize any interactive elements that might have been lost
      this.reinitializeInteractiveElements();
    }
  }

  reinitializeInteractiveElements() {
    // Re-initialize tooltips
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
      tooltips.forEach(tooltip => {
        new bootstrap.Tooltip(tooltip);
      });
    }

    // Re-initialize copy buttons
    const copyButtons = document.querySelectorAll('[id*="copy"]');
    copyButtons.forEach(button => {
      if (button.id === 'copy-link') {
        this.initializeCopyLink(button);
      }
    });

    // Re-initialize anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
      link.addEventListener('click', this.handleAnchorClick);
    });
  }

  initializeCopyLink(button) {
    if (button && !button.dataset.initialized) {
      button.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
          const originalTitle = button.getAttribute('title');
          button.setAttribute('title', 'Link copiado!');
          setTimeout(() => {
            button.setAttribute('title', originalTitle);
          }, 2000);
        });
      });
      button.dataset.initialized = 'true';
    }
  }

  handleAnchorClick(e) {
    e.preventDefault();
    const targetId = e.target.getAttribute('href').substring(1);
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth' });
    }
  }

  translateUIElements() {
    // Translate common UI elements
    const translations = {
      'pt-BR': {
        'search-hint': 'Buscar',
        'search-cancel': 'Cancelar',
        'posted': 'Postado em',
        'updated': 'Atualizado',
        'read-time': 'de leitura',
        'share': 'Compartilhar',
        'next': 'Próximo',
        'previous': 'Anterior',
        'home': 'Home',
        'categories': 'Categorias',
        'tags': 'Tags',
        'archives': 'Arquivos',
        'about': 'Sobre',
        'recently-updated': 'Atualizados recentemente',
        'trending-tags': 'Trending Tags',
        'contents': 'Conteúdo',
        'written-by': 'Por',
        'words': 'palavras',
        'pageview-measure': 'visualizações',
        'relate-posts': 'Leia também',
        'copy-code-succeed': 'Copiado!',
        'share-link-title': 'Copie o link',
        'share-link-succeed': 'Link copiado com sucesso!',
        'category-measure': 'categorias',
        'post-measure': 'posts',
        'license-template': 'Esta postagem está licenciada sob :LICENSE_NAME pelo autor.',
        'license-name': 'CC BY 4.0',
        'copyright-brief': 'Alguns direitos reservados.',
        'not-found-statement': 'Desculpe, a página não foi encontrada.',
        'update-found': 'Uma nova versão do conteúdo está disponível.',
        'update': 'atualização',
        'no-results': 'Oops! Nenhum resultado encontrado.'
      },
      'en': {
        'search-hint': 'Search',
        'search-cancel': 'Cancel',
        'posted': 'Posted',
        'updated': 'Updated',
        'read-time': 'read',
        'share': 'Share',
        'next': 'Newer',
        'previous': 'Older',
        'home': 'Home',
        'categories': 'Categories',
        'tags': 'Tags',
        'archives': 'Archives',
        'about': 'About',
        'recently-updated': 'Recently Updated',
        'trending-tags': 'Trending Tags',
        'contents': 'Contents',
        'written-by': 'By',
        'words': 'words',
        'pageview-measure': 'views',
        'relate-posts': 'Further Reading',
        'copy-code-succeed': 'Copied!',
        'share-link-title': 'Copy link',
        'share-link-succeed': 'Link copied successfully!',
        'category-measure': 'categories',
        'post-measure': 'posts',
        'license-template': 'This post is licensed under :LICENSE_NAME by the author.',
        'license-name': 'CC BY 4.0',
        'copyright-brief': 'Some rights reserved.',
        'not-found-statement': 'Sorry, we\'ve misplaced that URL or it\'s pointing to something that doesn\'t exist.',
        'update-found': 'A new version of content is available.',
        'update': 'Update',
        'no-results': 'Oops! No results found.'
      }
    };

    const currentTranslations = translations[this.currentLang];
    if (!currentTranslations) return;

    // Update search placeholder
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = currentTranslations['search-hint'] + '...';
    }

    // Update search cancel button
    const searchCancel = document.getElementById('search-cancel');
    if (searchCancel) {
      searchCancel.textContent = currentTranslations['search-cancel'];
    }

    // Update search results
    this.translateSearchElements(currentTranslations);

    // Update breadcrumb elements
    const breadcrumbSpans = document.querySelectorAll('#breadcrumb span');
    breadcrumbSpans.forEach(span => {
      const text = span.textContent.trim().toLowerCase();
      if (currentTranslations[text]) {
        span.textContent = currentTranslations[text];
      }
    });

    // Update sidebar navigation
    this.translateSidebarNavigation(currentTranslations);

    // Update sidebar elements
    this.translateSidebarElements(currentTranslations);
    
    // Update post meta elements
    this.translatePostMeta(currentTranslations);
    
    // Update footer elements
    this.translateFooterElements(currentTranslations);
    
    // Update notification elements
    this.translateNotificationElements(currentTranslations);
    
    // Update navigation elements
    this.translateNavigationElements(currentTranslations);

    // Update other UI elements
    Object.keys(currentTranslations).forEach(key => {
      const elements = document.querySelectorAll(`[data-translate="${key}"]`);
      elements.forEach(element => {
        element.textContent = currentTranslations[key];
      });
    });
  }

  translatePostMeta(translations) {
    // Translate "Posted" text
    const postedElements = document.querySelectorAll('.post-meta span');
    postedElements.forEach(element => {
      if (element.textContent.includes('Postado em') || element.textContent.includes('Posted')) {
        const dateElement = element.querySelector('time');
        if (dateElement) {
          const dateText = dateElement.textContent;
          element.innerHTML = `${translations['posted']} <time>${dateText}</time>`;
        }
      }
    });

    // Translate "Updated" text
    const updatedElements = document.querySelectorAll('.post-meta span');
    updatedElements.forEach(element => {
      if (element.textContent.includes('Atualizado') || element.textContent.includes('Updated')) {
        const dateElement = element.querySelector('time');
        if (dateElement) {
          const dateText = dateElement.textContent;
          element.innerHTML = `${translations['updated']} <time>${dateText}</time>`;
        }
      }
    });

    // Translate read time
    const readTimeElements = document.querySelectorAll('[data-read-time]');
    readTimeElements.forEach(element => {
      const time = element.getAttribute('data-read-time');
      element.textContent = `${time} ${translations['read-time']}`;
    });

    // Translate "Written by" text
    const writtenByElements = document.querySelectorAll('.post-meta em');
    writtenByElements.forEach(element => {
      if (element.textContent.includes('Por') || element.textContent.includes('By')) {
        const authorLink = element.querySelector('a');
        if (authorLink) {
          element.innerHTML = `${translations['written-by']} <em><a href="${authorLink.href}">${authorLink.textContent}</a></em>`;
        }
      }
    });
  }

  translateSidebarNavigation(translations) {
    // Translate sidebar navigation links
    const navLinks = document.querySelectorAll('#sidebar .nav-link span');
    navLinks.forEach(link => {
      const text = link.textContent.trim();
      if (text === 'HOME' || text === 'Home') {
        link.textContent = translations['home'];
      } else if (text === 'CATEGORIES' || text === 'Categories') {
        link.textContent = translations['categories'];
      } else if (text === 'TAGS' || text === 'Tags') {
        link.textContent = translations['tags'];
      } else if (text === 'ARCHIVES' || text === 'Archives') {
        link.textContent = translations['archives'];
      } else if (text === 'ABOUT' || text === 'About') {
        link.textContent = translations['about'];
      }
    });
  }

  translateSidebarElements(translations) {
    // Translate "Recently Updated" heading
    const recentlyUpdatedHeading = document.querySelector('#access-lastmod h2');
    if (recentlyUpdatedHeading) {
      recentlyUpdatedHeading.textContent = translations['recently-updated'];
    }

    // Translate "Trending Tags" heading
    const trendingTagsHeading = document.querySelector('section h2');
    if (trendingTagsHeading && trendingTagsHeading.textContent.includes('Trending Tags')) {
      trendingTagsHeading.textContent = translations['trending-tags'];
    }

    // Translate "Contents" heading
    const contentsHeading = document.querySelector('.panel-heading');
    if (contentsHeading && contentsHeading.textContent.includes('Conteúdo')) {
      contentsHeading.textContent = translations['contents'];
    }
  }

  translateFooterElements(translations) {
    // Translate copyright text
    const copyrightElements = document.querySelectorAll('footer span[data-bs-toggle="tooltip"]');
    copyrightElements.forEach(element => {
      if (element.textContent.includes('Alguns direitos reservados') || element.textContent.includes('Some rights reserved')) {
        element.textContent = translations['copyright-brief'];
      }
    });

    // Translate license text
    const licenseElements = document.querySelectorAll('.license-wrapper');
    licenseElements.forEach(element => {
      if (element.textContent.includes('Esta postagem está licenciada') || element.textContent.includes('This post is licensed')) {
        element.innerHTML = translations['license-template'].replace(':LICENSE_NAME', translations['license-name']);
      }
    });
  }

  translateNotificationElements(translations) {
    // Translate notification text
    const notificationText = document.querySelector('#notification .toast-body p');
    if (notificationText) {
      if (notificationText.textContent.includes('Uma nova versão') || notificationText.textContent.includes('A new version')) {
        notificationText.textContent = translations['update-found'];
      }
    }

    // Translate notification button
    const notificationButton = document.querySelector('#notification .toast-body button');
    if (notificationButton) {
      if (notificationButton.textContent.includes('atualização') || notificationButton.textContent.includes('Update')) {
        notificationButton.textContent = translations['update'];
      }
    }
  }

  translateSearchElements(translations) {
    // Translate search no results text
    const noResultsElements = document.querySelectorAll('#search-results p');
    noResultsElements.forEach(element => {
      if (element.textContent.includes('Nenhum resultado encontrado') || element.textContent.includes('No results found')) {
        element.textContent = translations['no-results'] || 'Oops! Nenhum resultado encontrado.';
      }
    });
  }

  translateNavigationElements(translations) {
    // Translate navigation buttons
    const navButtons = document.querySelectorAll('.post-navigation .btn');
    navButtons.forEach(button => {
      const ariaLabel = button.getAttribute('aria-label');
      if (ariaLabel === 'Anterior' || ariaLabel === 'Older') {
        button.setAttribute('aria-label', translations['previous']);
      } else if (ariaLabel === 'Próximo' || ariaLabel === 'Newer') {
        button.setAttribute('aria-label', translations['next']);
      }
    });

    // Translate share button
    const shareButton = document.querySelector('.share-label');
    if (shareButton) {
      if (shareButton.textContent.includes('Compartilhar') || shareButton.textContent.includes('Share')) {
        shareButton.textContent = translations['share'];
      }
    }

    // Translate copy link button
    const copyLinkButton = document.querySelector('#copy-link');
    if (copyLinkButton) {
      const title = copyLinkButton.getAttribute('title');
      if (title && (title.includes('Copie o link') || title.includes('Copy link'))) {
        copyLinkButton.setAttribute('title', translations['share-link-title']);
      }
    }
  }

  processMarkdown(content) {
    if (!content) return '';
    
    // Clean up the content first
    let processed = content.trim();
    
    // Process headers
    processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Process lists
    processed = processed.replace(/^[\s]*[-*+] (.*$)/gim, '<li>$1</li>');
    processed = processed.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Process numbered lists
    processed = processed.replace(/^[\s]*\d+\. (.*$)/gim, '<li>$1</li>');
    processed = processed.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    
    // Process bold and italic
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Process inline code
    processed = processed.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Process links
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Process paragraphs
    processed = processed.replace(/\n\n+/g, '</p><p>');
    processed = processed.replace(/\n/g, '<br>');
    
    // Wrap in paragraphs if not already wrapped
    if (!processed.startsWith('<')) {
      processed = '<p>' + processed + '</p>';
    }
    
    // Clean up empty paragraphs
    processed = processed.replace(/<p><\/p>/g, '');
    processed = processed.replace(/<p>\s*<\/p>/g, '');
    
    return processed;
  }

  updateURL() {
    const currentPath = window.location.pathname;
    let newPath = currentPath;
    
    if (this.currentLang === 'en') {
      // Switch to English - redirect to English post
      if (currentPath.includes('/exemplo-traducao-post/')) {
        newPath = '/en/example-translation-post/';
      } else if (currentPath.includes('/do-zero-a-um-operator-kubernetes/')) {
        newPath = '/en/from-zero-to-kubernetes-operator/';
      } else if (currentPath.includes('/vercel-vs-netlify-vs-railway-guerra-deploys/')) {
        newPath = '/en/vercel-vs-netlify-vs-railway-deploy-wars/';
      } else if (currentPath.includes('/provider-terraform-customizado/')) {
        newPath = '/en/creating-custom-terraform-provider/';
      } else if (currentPath.includes('/sistema-observabilidade-opentelemetry-go/')) {
        newPath = '/en/distributed-observability-kafka-jaeger-go/';
      } else if (currentPath.includes('/mvc-go-problemas-arquitetura-moderna/')) {
        newPath = '/en/why-senior-engineers-moving-away-mvc-go/';
      } else if (currentPath.startsWith('/en/')) {
        // Already on English page, stay there
        newPath = currentPath;
      } else {
        // Default English page
        newPath = '/en/';
      }
    } else {
      // Switch to Portuguese - redirect to Portuguese post
      if (currentPath.includes('/example-translation-post/')) {
        newPath = '/exemplo-traducao-post/';
      } else if (currentPath.includes('/from-zero-to-kubernetes-operator/')) {
        newPath = '/do-zero-a-um-operator-kubernetes/';
      } else if (currentPath.includes('/vercel-vs-netlify-vs-railway-deploy-wars/')) {
        newPath = '/vercel-vs-netlify-vs-railway-guerra-deploys/';
      } else if (currentPath.includes('/creating-custom-terraform-provider/')) {
        newPath = '/provider-terraform-customizado/';
      } else if (currentPath.includes('/distributed-observability-kafka-jaeger-go/')) {
        newPath = '/sistema-observabilidade-opentelemetry-go/';
      } else if (currentPath.includes('/why-senior-engineers-moving-away-mvc-go/')) {
        newPath = '/mvc-go-problemas-arquitetura-moderna/';
      } else if (currentPath.startsWith('/en/')) {
        // From English page to Portuguese
        newPath = currentPath.replace('/en/', '/');
      } else {
        // Default Portuguese page
        newPath = '/';
      }
    }
    
    if (newPath !== currentPath) {
      window.location.href = newPath;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LanguageToggle();
});

// Export for potential external use
window.LanguageToggle = LanguageToggle;
