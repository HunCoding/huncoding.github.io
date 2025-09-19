/* Newsletter functionality */

class Newsletter {
  constructor() {
    this.form = document.getElementById('newsletter-form');
    this.emailInput = document.getElementById('newsletter-email');
    this.submitButton = this.form?.querySelector('.newsletter-button');
    this.messageDiv = document.getElementById('newsletter-message');
    this.messageText = this.messageDiv?.querySelector('.message-text');
    this.buttonText = this.submitButton?.querySelector('.button-text');
    this.buttonLoading = this.submitButton?.querySelector('.button-loading');
    
    this.provider = this.form?.dataset.provider;
    this.config = this.getConfigFromHTML();
    
    this.init();
  }

  getConfigFromHTML() {
    const config = {};
    
    // Get Mailchimp config from hidden inputs
    const userInput = this.form?.querySelector('input[name="u"]');
    const listInput = this.form?.querySelector('input[name="id"]');
    
    console.log('Newsletter Debug:', {
      form: this.form,
      userInput: userInput,
      listInput: listInput,
      userValue: userInput?.value,
      listValue: listInput?.value
    });
    
    if (userInput && listInput) {
      config.mailchimp = {
        user_id: userInput.value,
        list_id: listInput.value,
        action_url: `https://github.us16.list-manage.com/subscribe/post?u=${userInput.value}&id=${listInput.value}&f_id=00c5c2e1f0`
      };
    }
    
    // Get messages from data attributes or use defaults
    config.success_message = this.form?.dataset.successMessage || 'Obrigado por se inscrever! Verifique seu email para confirmar.';
    config.error_message = this.form?.dataset.errorMessage || 'Ops! Algo deu errado. Tente novamente.';
    
    console.log('Newsletter Config:', config);
    return config;
  }

  init() {
    if (!this.form) return;
    
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.emailInput?.addEventListener('input', () => this.clearMessage());
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const email = this.emailInput.value.trim();
    console.log('Form submitted with email:', email);
    
    if (!this.validateEmail(email)) {
      console.log('Email validation failed');
      this.showMessage('Por favor, insira um email válido.', 'error');
      return;
    }

    console.log('Email validation passed, proceeding with submission');
    this.setLoading(true);
    this.clearMessage();

    try {
      await this.submitNewsletter(email);
    } catch (error) {
      console.error('Newsletter submission error:', error);
      this.showMessage(
        this.config.error_message || 'Ops! Algo deu errado. Tente novamente.',
        'error'
      );
    } finally {
      this.setLoading(false);
    }
  }

  async submitNewsletter(email) {
    const formData = new FormData(this.form);
    formData.set('email', email);

    switch (this.provider) {
      case 'mailchimp':
        return this.submitToMailchimp(formData);
      case 'convertkit':
        return this.submitToConvertKit(formData);
      case 'custom':
        return this.submitToCustom(formData);
      default:
        throw new Error('Provider not supported');
    }
  }

  async submitToMailchimp(formData) {
    const actionUrl = this.config.mailchimp?.action_url;
    console.log('Mailchimp submission:', { actionUrl, config: this.config.mailchimp });
    
    if (!actionUrl) {
      throw new Error('Mailchimp action URL not configured');
    }

    // Create a hidden iframe for form submission
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.name = 'mailchimp-iframe';
    document.body.appendChild(iframe);

    // Create a temporary form for submission
    const tempForm = document.createElement('form');
    tempForm.method = 'POST';
    tempForm.action = actionUrl;
    tempForm.target = 'mailchimp-iframe';
    tempForm.style.display = 'none';

    // Add form data to temporary form
    const formDataEntries = [];
    for (const [key, value] of formData.entries()) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      tempForm.appendChild(input);
      formDataEntries.push({ key, value });
    }

    console.log('Form data being submitted:', formDataEntries);
    console.log('Form action URL:', actionUrl);

    document.body.appendChild(tempForm);
    tempForm.submit();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(tempForm);
      document.body.removeChild(iframe);
    }, 1000);

    this.showMessage(
      this.config.success_message || 'Obrigado por se inscrever! Verifique seu email para confirmar.',
      'success'
    );
    this.emailInput.value = '';
  }

  async submitToConvertKit(formData) {
    const formId = this.config.convertkit?.form_id;
    if (!formId) {
      throw new Error('ConvertKit form ID not configured');
    }

    const response = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.config.convertkit?.api_key,
        email: formData.get('email'),
        fields: {
          first_name: formData.get('name') || ''
        }
      })
    });

    if (!response.ok) {
      throw new Error('ConvertKit submission failed');
    }

    this.showMessage(
      this.config.success_message || 'Obrigado por se inscrever!',
      'success'
    );
    this.emailInput.value = '';
  }

  async submitToCustom(formData) {
    const endpoint = this.config.custom?.endpoint;
    if (!endpoint) {
      throw new Error('Custom endpoint not configured');
    }

    const method = this.config.custom?.method || 'POST';
    const body = new FormData();
    
    // Map form fields according to configuration
    const emailField = this.config.custom?.fields?.email || 'email';
    const nameField = this.config.custom?.fields?.name || 'name';
    
    body.append(emailField, formData.get('email'));
    if (formData.get('name')) {
      body.append(nameField, formData.get('name'));
    }

    const response = await fetch(endpoint, {
      method: method,
      body: method === 'GET' ? null : body
    });

    if (!response.ok) {
      throw new Error('Custom submission failed');
    }

    this.showMessage(
      this.config.success_message || 'Obrigado por se inscrever!',
      'success'
    );
    this.emailInput.value = '';
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    console.log('Email validation:', { email, isValid });
    return isValid;
  }

  setLoading(loading) {
    if (!this.submitButton) return;
    
    this.submitButton.disabled = loading;
    
    if (loading) {
      this.buttonText?.classList.add('d-none');
      this.buttonLoading?.classList.remove('d-none');
    } else {
      this.buttonText?.classList.remove('d-none');
      this.buttonLoading?.classList.add('d-none');
    }
  }

  showMessage(message, type) {
    if (!this.messageDiv || !this.messageText) return;
    
    this.messageText.textContent = message;
    this.messageDiv.className = `newsletter-message ${type}`;
    this.messageDiv.classList.remove('d-none');
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.clearMessage();
      }, 5000);
    }
  }

  clearMessage() {
    if (this.messageDiv) {
      this.messageDiv.classList.add('d-none');
      this.messageDiv.className = 'newsletter-message d-none';
    }
  }
}

// Newsletter will be initialized by home.js

// Export for potential external use
window.Newsletter = Newsletter;

// Default export for ES modules
export default Newsletter;
