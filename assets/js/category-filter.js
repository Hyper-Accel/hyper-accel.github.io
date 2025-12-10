// Category filter functionality for Hugo blog posts
(function() {
  // Wait for DOM to be ready
  function init() {
    // Get posts data from JSON script tag
    const postsDataScript = document.getElementById('postsData');
    if (!postsDataScript) return; // Exit if no data available
    
    let allPostsData;
    try {
      let rawData = postsDataScript.textContent.trim();
      
      // Try to parse JSON
      let parsed = JSON.parse(rawData);
      
      // If parsed result is still a string, parse again (double-encoded JSON)
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      
      // Ensure it's an array
      if (Array.isArray(parsed)) {
        allPostsData = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // If it's an object, try to convert to array
        allPostsData = Object.values(parsed);
      } else {
        allPostsData = [];
      }
    } catch (e) {
      console.error('Failed to parse posts data:', e);
      return;
    }
    
    const postsGrid = document.getElementById('postsGrid');
    if (!postsGrid) return; // Exit if posts grid not found
  
    const postsPerPage = parseInt(postsGrid.getAttribute('data-posts-per-page')) || 5;
    const paginationFooter = document.getElementById('paginationFooter');
    const filterButtons = document.querySelectorAll('.category-filter-btn');
    
    let currentCategory = 'all';
    let currentPage = 1;
    
    // Function to render a post card
    function renderPostCard(post) {
      // Ensure categories is an array
      const categories = Array.isArray(post.categories) ? post.categories : [];
      const categoryClasses = categories.join(' ');
      let html = `<article class="${post.class} post-card" data-categories="${categoryClasses}">`;
      
      // Cover image
      if (post.coverImage) {
        html += `<figure class="entry-cover">
          <img loading="lazy" src="${escapeHtml(post.coverImage)}" alt="">
        </figure>`;
      }
      
      // Header
      html += `<header class="entry-header">
        <h2 class="entry-hint-parent">
          ${escapeHtml(post.title)}`;
      if (post.isDraft) {
        html += `<span class="entry-hint" title="Draft">
          <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M160-410v-60h300v60H160Zm0-165v-60h470v60H160Zm0-165v-60h470v60H160Zm360 580v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q9 9 13 20t4 22q0 11-4.5 22.5T862.09-380L643-160H520Zm300-263-37-37 37 37ZM580-220h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19Z" />
          </svg>
        </span>`;
      }
      html += `</h2>
      </header>`;
      
      // Summary
      if (!post.hideSummary) {
        html += `<div class="entry-content">
          <p>${escapeHtml(post.summary)}${post.truncated ? '...' : ''}</p>
        </div>`;
      }
      
      // Meta footer
      if (!post.hideMeta && post.metaItems && post.metaItems.length > 0) {
        const metaText = post.metaItems.map(item => `<span>${escapeHtml(item.value)}</span>`).join('&nbsp;·&nbsp;');
        html += `<footer class="entry-footer">
          ${metaText}
        </footer>`;
      }
      
      // Link
      html += `<a class="entry-link" aria-label="post link to ${escapeHtml(post.title)}" href="${escapeHtml(post.permalink)}"></a>
      </article>`;
      
      return html;
    }
    
    // Escape HTML to prevent XSS
    function escapeHtml(text) {
      if (text == null) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    // Function to filter and render posts
    function filterAndRenderPosts(category, page = 1) {
      // Ensure allPostsData is an array
      if (!Array.isArray(allPostsData)) {
        console.error('allPostsData is not an array:', allPostsData);
        return;
      }
      
      // Filter posts by category
      let filteredPosts = allPostsData;
      if (category !== 'all') {
        // Normalize category for comparison (lowercase, trim)
        const normalizedCategory = category.toLowerCase().trim();
        filteredPosts = allPostsData.filter(post => {
          const categories = Array.isArray(post.categories) ? post.categories : [];
          // Check if any category matches (case-insensitive)
          return categories.some(cat => {
            const normalizedCat = String(cat).toLowerCase().trim();
            return normalizedCat === normalizedCategory;
          });
        });
      }
      
      // Sort by date (newest first) - create a copy to avoid mutating original
      filteredPosts = [...filteredPosts].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA;
      });
      
      // For filtered categories, show all posts without pagination
      // For 'all' category, keep server-side pagination (don't re-render)
      if (category === 'all') {
        // Keep server-rendered posts, just show pagination
        if (paginationFooter) {
          paginationFooter.style.display = 'block';
        }
        return;
      }
      
      // Render all filtered posts (no pagination for filtered results)
      if (filteredPosts.length === 0) {
        postsGrid.innerHTML = '<p>해당 카테고리에 포스트가 없습니다.</p>';
      } else {
        postsGrid.innerHTML = filteredPosts.map(renderPostCard).join('');
      }
      if (paginationFooter) {
        paginationFooter.style.display = 'none';
      }
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Add event listeners to filter buttons
    filterButtons.forEach(button => {
      button.addEventListener('click', function() {
        const selectedCategory = this.getAttribute('data-category');
        
        // Update active button
        filterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        
        // Filter and render posts
        currentCategory = selectedCategory;
        currentPage = 1;
        filterAndRenderPosts(selectedCategory, 1);
      });
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
