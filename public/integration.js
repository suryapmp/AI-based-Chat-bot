/**
 * VTU Intelligence Core - Website Integration Script
 * 
 * INSTRUCTIONS:
 * 1. Deploy this application to Netlify.
 * 2. Copy your Netlify URL (e.g., https://vtu-bot.netlify.app).
 * 3. Replace 'YOUR_DEPLOYED_URL' below with your actual URL.
 * 4. Add the following script tag to the <head> or <body> of the VTU website:
 *    <script src="https://YOUR_DEPLOYED_URL/integration.js"></script>
 */

(function() {
  // --- CONFIGURATION ---
  // Replace this with your actual Netlify URL after deployment
  const BASE_URL = window.location.origin; 
  
  // --- IMPLEMENTATION ---
  const ID = 'vtu-chatbot-integration';
  if (document.getElementById(ID)) return;

  // Create iframe container
  const iframe = document.createElement('iframe');
  iframe.id = ID;
  iframe.src = BASE_URL;
  
  // Styling for the floating widget container
  // We make it large enough to fit the chat window, but transparent
  Object.assign(iframe.style, {
    position: 'fixed',
    bottom: '0',
    right: '0',
    width: '500px',
    height: '800px',
    border: 'none',
    zIndex: '999999',
    colorScheme: 'none',
    background: 'transparent',
    transition: 'all 0.3s ease'
  });

  // Handle mobile responsiveness for the iframe itself
  const handleResize = () => {
    if (window.innerWidth < 640) {
      iframe.style.width = '100%';
      iframe.style.height = '100%';
    } else {
      iframe.style.width = '500px';
      iframe.style.height = '800px';
    }
  };

  window.addEventListener('resize', handleResize);
  handleResize();

  // Allow necessary permissions for the chatbot (Camera/Mic if needed)
  iframe.allow = 'microphone; camera; geolocation; clipboard-read; clipboard-write';

  // Append to body
  document.body.appendChild(iframe);

  console.log('VTU Intelligence Core: Integration script loaded successfully.');
})();
