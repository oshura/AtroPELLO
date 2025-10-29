/**
 * Testing script for AdaptiveTargetingSystem
 * Run this in browser console to test the system
 */

// Test function to check if adaptive targeting is working
function testAdaptiveTargeting() {
  console.log('🧪 Testing AdaptiveTargetingSystem...');
  
  // Try to access the game engine through Angular's global
  const gameComponent = document.querySelector('app-game');
  if (!gameComponent) {
    console.error('❌ Game component not found');
    return;
  }
  
  // Check if we can access the Angular component instance
  const ngInstance = gameComponent.__ngContext__;
  if (!ngInstance) {
    console.error('❌ Angular context not found');
    return;
  }
  
  console.log('✅ Game component found, testing will continue...');
  
  // Monitor console for adaptive targeting logs
  console.log('👀 Monitor console for:');
  console.log('   🎯 Adaptive Targeting: ... (should appear when moving mouse)');
  console.log('   📏 Target categorized: ... (should appear occasionally)');
  console.log('   🚀 GameEngine→AdaptiveTargeting.update(): ... (every 2 seconds)');
  
  return true;
}

// Test mouse simulation
function simulateMouseMovement() {
  console.log('🖱️ Simulating mouse movement...');
  
  const canvas = document.querySelector('canvas');
  if (!canvas) {
    console.error('❌ Canvas not found');
    return;
  }
  
  // Simulate mouse move events
  const rect = canvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const x = centerX + Math.random() * 100 - 50;
      const y = centerY + Math.random() * 100 - 50;
      
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true
      });
      
      canvas.dispatchEvent(mouseEvent);
      console.log(`🖱️ Simulated mouse at (${Math.round(x)}, ${Math.round(y)})`);
    }, i * 500);
  }
}

// Test click simulation
function simulateClick() {
  console.log('🖱️ Simulating click...');
  
  const canvas = document.querySelector('canvas');
  if (!canvas) {
    console.error('❌ Canvas not found');
    return;
  }
  
  const rect = canvas.getBoundingClientRect();
  const clickEvent = new MouseEvent('click', {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true
  });
  
  canvas.dispatchEvent(clickEvent);
  console.log('🖱️ Click simulated at canvas center');
}

// Export functions to global scope
window.testAdaptiveTargeting = testAdaptiveTargeting;
window.simulateMouseMovement = simulateMouseMovement;
window.simulateClick = simulateClick;

console.log('🧪 Test functions loaded:');
console.log('   testAdaptiveTargeting() - Check system status');
console.log('   simulateMouseMovement() - Test mouse detection');
console.log('   simulateClick() - Test click handling');