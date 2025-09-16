# Last Modified Hook Plugin
# Automatically sets last_modified_at based on git commit history

Jekyll::Hooks.register :posts, :pre_render do |post, payload|
  # Get the last modified date from git
  if File.exist?(post.path)
    last_modified = `git log -1 --format="%ci" -- "#{post.path}" 2>/dev/null`.strip
    if last_modified && !last_modified.empty?
      # Parse the git date and convert to Jekyll format
      last_modified_time = Time.parse(last_modified)
      post.data['last_modified_at'] = last_modified_time
    end
  end
end

Jekyll::Hooks.register :pages, :pre_render do |page, payload|
  # Only process markdown pages
  if page.ext == '.md' && File.exist?(page.path)
    last_modified = `git log -1 --format="%ci" -- "#{page.path}" 2>/dev/null`.strip
    if last_modified && !last_modified.empty?
      last_modified_time = Time.parse(last_modified)
      page.data['last_modified_at'] = last_modified_time
    end
  end
end
