# Translation Processor Plugin
# Processes post translations and makes them available to the frontend

module Jekyll
  class TranslationProcessor < Generator
    safe true
    priority :high

    def generate(site)
      # Process each post to extract translations
      site.posts.docs.each do |post|
        process_post_translations(post)
      end

      # Process pages as well
      site.pages.each do |page|
        if page.data['layout'] == 'post' || page.data['translations']
          process_page_translations(page)
        end
      end
    end

    private

    def process_post_translations(post)
      return unless post.data['translations']

      translations = post.data['translations']
      
      # Create a structured translation object
      translation_data = {
        'title' => {
          'pt-BR' => post.data['title'],
          'en' => translations['title_en'] || post.data['title']
        },
        'subtitle' => {
          'pt-BR' => post.data['subtitle'],
          'en' => translations['subtitle_en'] || post.data['subtitle']
        },
        'content' => {
          'pt-BR' => post.content,
          'en' => translations['content_en'] || post.content
        }
      }

      # Add translation data to post
      post.data['translation_data'] = translation_data
      
      # Create a JSON representation for the frontend
      post.data['translation_json'] = translation_data.to_json
    end

    def process_page_translations(page)
      return unless page.data['translations']

      translations = page.data['translations']
      
      translation_data = {
        'title' => {
          'pt-BR' => page.data['title'],
          'en' => translations['title_en'] || page.data['title']
        },
        'content' => {
          'pt-BR' => page.content,
          'en' => translations['content_en'] || page.content
        }
      }

      page.data['translation_data'] = translation_data
      page.data['translation_json'] = translation_data.to_json
    end
  end

  # Hook to inject translation data into the page
  Jekyll::Hooks.register :posts, :pre_render do |post, payload|
    if post.data['translation_json']
      # Add translation data to the page payload
      payload['page']['translation_json'] = post.data['translation_json']
    end
  end

  Jekyll::Hooks.register :pages, :pre_render do |page, payload|
    if page.data['translation_json']
      payload['page']['translation_json'] = page.data['translation_json']
    end
  end
end
