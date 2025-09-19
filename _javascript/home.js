import { basic, initSidebar, initTopbar } from './modules/layouts';
import { initLocaleDatetime, loadImg, Newsletter } from './modules/components';

loadImg();
initLocaleDatetime();
initSidebar();
initTopbar();
basic();

// Initialize newsletter
new Newsletter();
