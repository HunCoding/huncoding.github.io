/**
 * Enhanced Language Toggle System - Simple State Management
 * Handles redirection for posts and dynamic translation for home page
 */

console.log('🌍 Enhanced Language Toggle System loaded');

class EnhancedLanguageToggle {
  constructor() {
    this.currentLang = this.getCurrentLanguage();
    this.targetLang = this.currentLang === 'pt-BR' ? 'en' : 'pt-BR';
    this.isInitialized = false;
    this.init();
  }

  getCurrentLanguage() {
    // Check URL first
    const path = window.location.pathname;
    if (path.startsWith('/en/')) {
      return 'en';
    }
    
    // Check localStorage
    const stored = localStorage.getItem('preferred-language');
    if (stored && (stored === 'pt-BR' || stored === 'en')) {
      return stored;
    }
    
    return 'pt-BR';
  }

  init() {
    console.log('🚀 Initializing Enhanced Language Toggle');
    this.setupEventListeners();
    this.updateLanguageDisplay();
    
    // Apply translations on page load if not default language
    if (this.currentLang !== 'pt-BR') {
      console.log('🔄 Applying saved language on page load:', this.currentLang);
      this.applyTranslations();
    }
    
    this.isInitialized = true;
    console.log('✅ Enhanced Language Toggle initialized');
  }

  setupEventListeners() {
    const button = document.getElementById('language-toggle');
    if (button) {
      // Remove existing listeners
      button.replaceWith(button.cloneNode(true));
      const newButton = document.getElementById('language-toggle');
      
      newButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleLanguage();
      });
      
      console.log('✅ Event listener added');
    } else {
      console.log('❌ Button not found, retrying...');
      setTimeout(() => this.setupEventListeners(), 100);
    }
  }

  updateLanguageDisplay() {
    const langSpan = document.getElementById('current-lang');
    if (langSpan) {
      langSpan.textContent = this.currentLang.toUpperCase();
    }
  }

  toggleLanguage() {
    console.log('🔄 Toggling language from', this.currentLang, 'to', this.targetLang);
    
    // Update current language
    this.currentLang = this.targetLang;
    this.targetLang = this.currentLang === 'pt-BR' ? 'en' : 'pt-BR';
    
    // Save preference
    localStorage.setItem('preferred-language', this.currentLang);
    
    // Update display
    this.updateLanguageDisplay();
    
    // Show feedback
    this.showFeedback();
    
    // Check if we should redirect or translate
    this.handleLanguageChange();
  }

  handleLanguageChange() {
    const currentPath = window.location.pathname;
    console.log('🔄 Current path:', currentPath);
    
    // Post mappings for redirection
    const postMappings = {
      // Portuguese to English
      '/exemplo-traducao-post/': '/en/example-translation-post/',
      '/do-zero-a-um-operator-kubernetes/': '/en/from-zero-to-kubernetes-operator/',
      '/provider-terraform-customizado/': '/en/creating-custom-terraform-provider/',
      '/sistema-observabilidade-opentelemetry-go/': '/en/distributed-observability-kafka-jaeger-go/',
      '/vercel-vs-netlify-vs-railway-guerra-deploys/': '/en/vercel-vs-netlify-vs-railway-deploy-wars/'
    };

    // Check if we're on a specific post page
    if (postMappings[currentPath] || this.getPortuguesePath(currentPath)) {
      if (this.currentLang === 'en') {
        // Redirecting to English version
        const englishPath = postMappings[currentPath];
        if (englishPath) {
          console.log('➡️ Redirecting to English:', englishPath);
          window.location.href = englishPath;
          return;
        }
      } else {
        // Redirecting to Portuguese version
        const portuguesePath = this.getPortuguesePath(currentPath);
        if (portuguesePath) {
          console.log('⬅️ Redirecting to Portuguese:', portuguesePath);
          window.location.href = portuguesePath;
          return;
        }
      }
    }

    // If no specific post mapping (home page, categories, etc.), apply dynamic translation
    console.log('🌐 No specific post mapping, applying dynamic translation');
    this.applyTranslations();
  }

  getPortuguesePath(englishPath) {
    const postMappings = {
      '/exemplo-traducao-post/': '/en/example-translation-post/',
      '/do-zero-a-um-operator-kubernetes/': '/en/from-zero-to-kubernetes-operator/',
      '/provider-terraform-customizado/': '/en/creating-custom-terraform-provider/',
      '/sistema-observabilidade-opentelemetry-go/': '/en/distributed-observability-kafka-jaeger-go/',
      '/vercel-vs-netlify-vs-railway-guerra-deploys/': '/en/vercel-vs-netlify-vs-railway-deploy-wars/'
    };

    for (const ptPath in postMappings) {
      if (postMappings[ptPath] === englishPath) {
        return ptPath;
      }
    }
    return null;
  }

  applyTranslations() {
    console.log('🔄 Applying translations for:', this.currentLang);
    
    // Translate UI elements
    this.translateUIElements();
    
    // Translate tags
    this.translateTags();
    
    // Translate post titles in recently updated
    this.translatePostTitles();
    
    // Translate post titles on home page
    this.translateHomePagePosts();
    
    // Translate post links on home page
    this.translateHomePageLinks();
    
    // Translate post content if available
    this.translatePostContent();
  }

  translateUIElements() {
    const translations = {
      'pt-BR': {
        'search-hint': 'Buscar',
        'search-cancel': 'Cancelar',
        'home': 'HOME',
        'categories': 'CATEGORIES',
        'tags': 'TAGS',
        'archives': 'ARCHIVES',
        'about': 'ABOUT',
        'recently-updated': 'Atualizados recentemente',
        'trending-tags': 'Trending Tags',
        'posted': 'Postado em',
        'updated': 'Atualizado em',
        'share': 'Compartilhar',
        'read-also': 'Leia também',
        'previous': 'Anterior',
        'next': 'Próximo',
        'some-rights-reserved': 'Alguns direitos reservados.',
        'license-text': 'Esta postagem está licenciada sob',
        'by-author': 'pelo autor.',
        'buy-coffee': 'Me compre um café ☕'
      },
      'en': {
        'search-hint': 'Search',
        'search-cancel': 'Cancel',
        'home': 'HOME',
        'categories': 'CATEGORIES',
        'tags': 'TAGS',
        'archives': 'ARCHIVES',
        'about': 'ABOUT',
        'recently-updated': 'Recently Updated',
        'trending-tags': 'Trending Tags',
        'posted': 'Posted',
        'updated': 'Updated',
        'share': 'Share',
        'read-also': 'Read also',
        'previous': 'Older',
        'next': 'Newer',
        'some-rights-reserved': 'Some rights reserved.',
        'license-text': 'This post is licensed under',
        'by-author': 'by the author.',
        'buy-coffee': 'Buy me a coffee ☕'
      }
    };

    const currentTranslations = translations[this.currentLang];
    if (!currentTranslations) return;

    console.log('🔄 Translating UI elements to:', this.currentLang);

    // Search elements
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = currentTranslations['search-hint'] + '...';
    }

    const searchCancel = document.getElementById('search-cancel');
    if (searchCancel) {
      searchCancel.textContent = currentTranslations['search-cancel'];
    }

    // Sidebar navigation
    const navLinks = document.querySelectorAll('#sidebar .nav-link span');
    navLinks.forEach(link => {
      const text = link.textContent.trim();
      if (text === 'HOME') {
        link.textContent = currentTranslations['home'];
      } else if (text === 'CATEGORIES') {
        link.textContent = currentTranslations['categories'];
      } else if (text === 'TAGS') {
        link.textContent = currentTranslations['tags'];
      } else if (text === 'ARCHIVES') {
        link.textContent = currentTranslations['archives'];
      } else if (text === 'ABOUT') {
        link.textContent = currentTranslations['about'];
      }
    });

    // Panel headings
    const recentlyUpdatedHeading = document.querySelector('#access-lastmod h2');
    if (recentlyUpdatedHeading) {
      recentlyUpdatedHeading.textContent = currentTranslations['recently-updated'];
    }

    // Post meta elements
    const postedElements = document.querySelectorAll('.post-meta span');
    postedElements.forEach(element => {
      if (element.textContent.includes('Postado em') || element.textContent.includes('Posted')) {
        const timeElement = element.querySelector('time');
        if (timeElement) {
          const dateText = timeElement.textContent;
          element.innerHTML = `${currentTranslations['posted']} <time data-ts="${timeElement.getAttribute('data-ts')}" data-df="${timeElement.getAttribute('data-df')}" data-bs-toggle="tooltip" data-bs-placement="bottom">${dateText}</time>`;
        }
      }
    });

    const updatedElements = document.querySelectorAll('.post-meta span');
    updatedElements.forEach(element => {
      if (element.textContent.includes('Atualizado') || element.textContent.includes('Updated')) {
        const timeElement = element.querySelector('time');
        if (timeElement) {
          const dateText = timeElement.textContent;
          element.innerHTML = `${currentTranslations['updated']} <time data-ts="${timeElement.getAttribute('data-ts')}" data-df="${timeElement.getAttribute('data-df')}" data-bs-toggle="tooltip" data-bs-placement="bottom">${dateText}</time>`;
        }
      }
    });

    // Share button
    const shareButton = document.querySelector('.share-label');
    if (shareButton) {
      shareButton.textContent = currentTranslations['share'];
    }

    // Related posts heading
    const relatedPostsHeading = document.querySelector('#related-label');
    if (relatedPostsHeading) {
      relatedPostsHeading.textContent = currentTranslations['read-also'];
    }

    // Navigation buttons
    const navButtons = document.querySelectorAll('.post-navigation .btn');
    navButtons.forEach(button => {
      const ariaLabel = button.getAttribute('aria-label');
      if (ariaLabel === 'Anterior' || ariaLabel === 'Older') {
        button.setAttribute('aria-label', currentTranslations['previous']);
      } else if (ariaLabel === 'Próximo' || ariaLabel === 'Newer') {
        button.setAttribute('aria-label', currentTranslations['next']);
      }
    });

    // Footer elements
    const copyrightElements = document.querySelectorAll('footer span[data-bs-toggle="tooltip"]');
    copyrightElements.forEach(element => {
      if (element.textContent.includes('Alguns direitos reservados') || element.textContent.includes('Some rights reserved')) {
        element.textContent = currentTranslations['some-rights-reserved'];
      }
    });

    // License text
    const licenseElements = document.querySelectorAll('.license-wrapper');
    licenseElements.forEach(element => {
      if (element.textContent.includes('Esta postagem está licenciada') || element.textContent.includes('This post is licensed')) {
        element.innerHTML = `${currentTranslations['license-text']} <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> ${currentTranslations['by-author']}`;
      }
    });

    // Ko-fi button
    const koFiButton = document.querySelector('.ko-fi-container a');
    if (koFiButton) {
      koFiButton.innerHTML = `<i class="fas fa-coffee" style="margin-right: 6px;"></i> ${currentTranslations['buy-coffee']}`;
    }

    console.log('✅ UI elements translated');
  }

  translateTags() {
    const tagTranslations = {
      'exemplo': 'example',
      'tradução': 'translation',
      'multilíngue': 'multilingual',
      'devops': 'devops',
      'api': 'api',
      'go': 'go',
      'golang': 'golang',
      'jaeger': 'jaeger',
      'distributed-systems': 'distributed-systems',
      'fault-tolerance': 'fault-tolerance',
      'kubernetes': 'kubernetes',
      'operator': 'operator',
      'terraform': 'terraform',
      'provider': 'provider',
      'observabilidade': 'observability',
      'kafka': 'kafka',
      'tracing': 'tracing',
      'vercel': 'vercel',
      'netlify': 'netlify',
      'railway': 'railway',
      'deploy': 'deploy'
    };

    console.log('🔄 Translating tags for:', this.currentLang);

    // Translate tags in trending tags section
    const tagButtons = document.querySelectorAll('.post-tag');
    tagButtons.forEach(button => {
      const originalText = button.textContent.trim();
      const translatedText = tagTranslations[originalText];
      
      if (translatedText && this.currentLang === 'en') {
        // Store original text if not already stored
        if (!button.dataset.originalText) {
          button.dataset.originalText = originalText;
        }
        button.textContent = translatedText;
        console.log(`✅ Tag translated: ${originalText} → ${translatedText}`);
      } else if (button.dataset.originalText && this.currentLang === 'pt-BR') {
        // Restore original text
        button.textContent = button.dataset.originalText;
        console.log(`✅ Tag restored: ${button.dataset.originalText}`);
      }
    });

    // Translate tags in post meta
    const postTags = document.querySelectorAll('.post-tags .post-tag');
    postTags.forEach(tag => {
      const originalText = tag.textContent.trim();
      const translatedText = tagTranslations[originalText];
      
      if (translatedText && this.currentLang === 'en') {
        if (!tag.dataset.originalText) {
          tag.dataset.originalText = originalText;
        }
        tag.textContent = translatedText;
        console.log(`✅ Post tag translated: ${originalText} → ${translatedText}`);
      } else if (tag.dataset.originalText && this.currentLang === 'pt-BR') {
        tag.textContent = tag.dataset.originalText;
        console.log(`✅ Post tag restored: ${tag.dataset.originalText}`);
      }
    });

    console.log('✅ Tags translated');
  }

  translatePostTitles() {
    console.log('🔄 Translating post titles in recently updated section');
    
    // Post title translations mapping - CORRECTED TITLES
    const titleTranslations = {
      'Exemplo de Post com Tradução': 'Example Post with Translation',
      'Do zero a um Operador Kubernetes que observa ConfigMaps': 'From Zero to Kubernetes Operator',
      'Criando um Provider Terraform Customizado do Zero': 'Creating Custom Terraform Provider',
      'Observabilidade Distribuída: Kafka + Jaeger + Go para Tracing Resiliente': 'Distributed Observability: Kafka + Jaeger + Go',
      'Vercel vs Netlify vs Railway: Guerra dos Deploys': 'Vercel vs Netlify vs Railway: Deploy Wars'
    };

    // Translate titles in recently updated section
    const recentlyUpdatedLinks = document.querySelectorAll('#access-lastmod a');
    recentlyUpdatedLinks.forEach(link => {
      const originalTitle = link.textContent.trim();
      const translatedTitle = titleTranslations[originalTitle];
      
      if (translatedTitle && this.currentLang === 'en') {
        // Store original title if not already stored
        if (!link.dataset.originalTitle) {
          link.dataset.originalTitle = originalTitle;
        }
        link.textContent = translatedTitle;
        console.log(`✅ Post title translated: ${originalTitle} → ${translatedTitle}`);
      } else if (link.dataset.originalTitle && this.currentLang === 'pt-BR') {
        // Restore original title
        link.textContent = link.dataset.originalTitle;
        console.log(`✅ Post title restored: ${link.dataset.originalTitle}`);
      }
    });

    // Translate titles in related posts section
    const relatedPostTitles = document.querySelectorAll('#related-posts h4');
    relatedPostTitles.forEach(title => {
      const originalTitle = title.textContent.trim();
      const translatedTitle = titleTranslations[originalTitle];
      
      if (translatedTitle && this.currentLang === 'en') {
        if (!title.dataset.originalTitle) {
          title.dataset.originalTitle = originalTitle;
        }
        title.textContent = translatedTitle;
        console.log(`✅ Related post title translated: ${originalTitle} → ${translatedTitle}`);
      } else if (title.dataset.originalTitle && this.currentLang === 'pt-BR') {
        title.textContent = title.dataset.originalTitle;
        console.log(`✅ Related post title restored: ${title.dataset.originalTitle}`);
      }
    });

    console.log('✅ Post titles translated');
  }

  translateHomePagePosts() {
    console.log('🔄 Translating post titles on home page');
    
    // Post title translations mapping
    const titleTranslations = {
      'Exemplo de Post com Tradução': 'Example Post with Translation',
      'Do zero a um Operador Kubernetes que observa ConfigMaps': 'From Zero to Kubernetes Operator',
      'Criando um Provider Terraform Customizado do Zero': 'Creating Custom Terraform Provider',
      'Observabilidade Distribuída: Kafka + Jaeger + Go para Tracing Resiliente': 'Distributed Observability: Kafka + Jaeger + Go',
      'Vercel vs Netlify vs Railway: Guerra dos Deploys': 'Vercel vs Netlify vs Railway: Deploy Wars'
    };

    // Translate post titles on home page (main content area)
    const homePostTitles = document.querySelectorAll('#post-list .card-title');
    homePostTitles.forEach(title => {
      const originalTitle = title.textContent.trim();
      const translatedTitle = titleTranslations[originalTitle];
      
      if (translatedTitle && this.currentLang === 'en') {
        if (!title.dataset.originalTitle) {
          title.dataset.originalTitle = originalTitle;
        }
        title.textContent = translatedTitle;
        console.log(`✅ Home page post title translated: ${originalTitle} → ${translatedTitle}`);
      } else if (title.dataset.originalTitle && this.currentLang === 'pt-BR') {
        title.textContent = title.dataset.originalTitle;
        console.log(`✅ Home page post title restored: ${title.dataset.originalTitle}`);
      }
    });

    // Translate post descriptions on home page
    const homePostDescriptions = document.querySelectorAll('#post-list .card-text p');
    homePostDescriptions.forEach(description => {
      const originalText = description.textContent.trim();
      
      // Simple description translations
      const descriptionTranslations = {
        'E aí, pessoal! Hoje vou te mostrar como criar um **blog multilíngue** usando Jekyll e JavaScript. É uma funcionalidade super útil para alcançar uma **audiência global** com seu conteúdo.': 'Hey everyone! Today I\'m going to show you how to create a **multilingual blog** using Jekyll and JavaScript. This is a super useful feature for reaching a **global audience** with your content.',
        'E aí, pessoal! Hoje vou te mostrar como criar um sistema de tracing distribuído resiliente usando Apache Kafka e Jaeger. A ideia é simples: e se o Jaeger cair? Você perde todos os traces? Não! Vam...': 'Hey everyone! Today I\'m going to show you how to create a resilient distributed tracing system using Apache Kafka and Jaeger. The idea is simple: what if Jaeger goes down? Do you lose all traces? No! We\'ll...',
        'E aí, pessoal! Hoje vou te mostrar como criar um Provider Terraform customizado do zero usando Go. É um tema que muitos desenvolvedores têm medo de encarar, mas na verdade não é esse bicho de sete ...': 'Hey everyone! Today I\'m going to show you how to create a custom Terraform Provider from scratch using Go. It\'s a topic that many developers are afraid to tackle, but it\'s actually not that difficult...',
        'E aí, pessoal! Hoje vou te mostrar como criar um Operador Kubernetes do zero que monitora mudanças em ConfigMaps e envia eventos para um webhook. É uma funcionalidade super útil para fazer hot rel...': 'Hey everyone! Today I\'m going to show you how to create a Kubernetes Operator from scratch that monitors ConfigMap changes and sends events to a webhook. It\'s a super useful feature for hot reload...'
      };
      
      const translatedText = descriptionTranslations[originalText];
      
      if (translatedText && this.currentLang === 'en') {
        if (!description.dataset.originalText) {
          description.dataset.originalText = originalText;
        }
        description.textContent = translatedText;
        console.log(`✅ Home page description translated`);
      } else if (description.dataset.originalText && this.currentLang === 'pt-BR') {
        description.textContent = description.dataset.originalText;
        console.log(`✅ Home page description restored`);
      }
    });

    console.log('✅ Home page posts translated');
  }

  translateHomePageLinks() {
    console.log('🔄 Translating post links on home page');
    
    // Post link mappings
    const linkMappings = {
      '/exemplo-traducao-post/': '/en/example-translation-post/',
      '/do-zero-a-um-operator-kubernetes/': '/en/from-zero-to-kubernetes-operator/',
      '/provider-terraform-customizado/': '/en/creating-custom-terraform-provider/',
      '/sistema-observabilidade-opentelemetry-go/': '/en/distributed-observability-kafka-jaeger-go/',
      '/vercel-vs-netlify-vs-railway-guerra-deploys/': '/en/vercel-vs-netlify-vs-railway-deploy-wars/'
    };

    // Translate post links on home page
    const homePostLinks = document.querySelectorAll('#post-list .post-preview');
    homePostLinks.forEach(link => {
      const originalHref = link.getAttribute('href');
      const translatedHref = linkMappings[originalHref];
      
      if (translatedHref && this.currentLang === 'en') {
        // Store original href if not already stored
        if (!link.dataset.originalHref) {
          link.dataset.originalHref = originalHref;
        }
        link.setAttribute('href', translatedHref);
        console.log(`✅ Home page link translated: ${originalHref} → ${translatedHref}`);
      } else if (link.dataset.originalHref && this.currentLang === 'pt-BR') {
        // Restore original href
        link.setAttribute('href', link.dataset.originalHref);
        console.log(`✅ Home page link restored: ${link.dataset.originalHref}`);
      }
    });

    // Translate links in recently updated section
    const recentlyUpdatedLinks = document.querySelectorAll('#access-lastmod a');
    recentlyUpdatedLinks.forEach(link => {
      const originalHref = link.getAttribute('href');
      const translatedHref = linkMappings[originalHref];
      
      if (translatedHref && this.currentLang === 'en') {
        // Store original href if not already stored
        if (!link.dataset.originalHref) {
          link.dataset.originalHref = originalHref;
        }
        link.setAttribute('href', translatedHref);
        console.log(`✅ Recently updated link translated: ${originalHref} → ${translatedHref}`);
      } else if (link.dataset.originalHref && this.currentLang === 'pt-BR') {
        // Restore original href
        link.setAttribute('href', link.dataset.originalHref);
        console.log(`✅ Recently updated link restored: ${link.dataset.originalHref}`);
      }
    });

    console.log('✅ Home page links translated');
  }

  translatePostContent() {
    console.log('🔄 Checking for post content translations...');
    
    // Check if we have translation data available
    const pageData = window.pageData || {};
    const translations = pageData.translations || {};
    
    console.log('📊 Page data available:', !!pageData);
    console.log('📊 Translations available:', !!translations);
    console.log('📊 Current language:', this.currentLang);
    console.log('📊 Translation keys:', Object.keys(translations));
    
    if (!translations.title || !translations.content) {
      console.log('⚠️ No post translations available');
      console.log('📊 Title available:', !!translations.title);
      console.log('📊 Content available:', !!translations.content);
      return;
    }

    console.log('🔄 Translating post content');

    // Translate title
    const title = document.querySelector('h1[data-toc-skip]');
    if (title && translations.title[this.currentLang]) {
      if (!title.dataset.originalText) {
        title.dataset.originalText = title.textContent;
      }
      title.textContent = translations.title[this.currentLang];
      console.log('✅ Post title translated to:', translations.title[this.currentLang]);
    } else {
      console.log('⚠️ Title element or translation not found');
      console.log('📊 Title element found:', !!title);
      console.log('📊 Title translation available:', !!translations.title[this.currentLang]);
    }

    // Translate content
    const content = document.querySelector('.content');
    console.log('📊 Content element found:', !!content);
    console.log('📊 Content element selector:', '.content');
    console.log('📊 All elements with class content:', document.querySelectorAll('.content').length);
    
    if (content && translations.content[this.currentLang]) {
      if (!content.dataset.originalContent) {
        content.dataset.originalContent = content.innerHTML;
        console.log('📊 Original content stored');
      }
      
      const translation = translations.content[this.currentLang];
      console.log('📊 Translation content length:', translation.length);
      console.log('📊 Translation content preview:', translation.substring(0, 100) + '...');
      
      let processed = translation.trim();
      
      // Process markdown to HTML
      processed = this.processMarkdown(processed);
      
      console.log('📊 Processed content length:', processed.length);
      console.log('📊 Processed content preview:', processed.substring(0, 100) + '...');
      
      content.innerHTML = processed;
      console.log('✅ Post content translated successfully');
    } else {
      console.log('⚠️ Content element or translation not found');
      console.log('📊 Content element found:', !!content);
      console.log('📊 Content translation available:', !!translations.content[this.currentLang]);
      if (translations.content) {
        console.log('📊 Available content languages:', Object.keys(translations.content));
      }
    }
  }

  processMarkdown(markdown) {
    console.log('🔄 Processing markdown content...');
    
    let html = markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3 id="$1"><span class="me-2">$1</span><a href="#$1" class="anchor text-muted"><i class="fas fa-hashtag"></i></a></h3>')
      .replace(/^## (.*$)/gim, '<h2 id="$1"><span class="me-2">$1</span><a href="#$1" class="anchor text-muted"><i class="fas fa-hashtag"></i></a></h2>')
      .replace(/^# (.*$)/gim, '<h1 id="$1"><span class="me-2">$1</span><a href="#$1" class="anchor text-muted"><i class="fas fa-hashtag"></i></a></h1>')
      
      // Lists
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      
      // Text formatting
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      
      // Line breaks and paragraphs
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');
    
    // Wrap in paragraph tags if not already wrapped
    if (!html.startsWith('<')) {
      html = '<p>' + html + '</p>';
    }
    
    console.log('✅ Markdown processed successfully');
    return html;
  }

  showFeedback() {
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
    `;
    
    const langName = this.currentLang === 'pt-BR' ? 'Português' : 'English';
    const flag = this.currentLang === 'pt-BR' ? '🇧🇷' : '🇺🇸';
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 1.1em;">${flag}</span>
        <span><strong>${langName}</strong></span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0) scale(1)';
    }, 10);
    
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🎯 DOM loaded, initializing Enhanced Language Toggle');
  new EnhancedLanguageToggle();
});

// Also try immediate initialization
if (document.readyState === 'loading') {
  console.log('⏳ DOM still loading, waiting...');
} else {
  console.log('⚡ DOM already loaded, initializing immediately');
  new EnhancedLanguageToggle();
}
