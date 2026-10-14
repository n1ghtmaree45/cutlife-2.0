import { render } from 'preact';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/extras.css';
import { App } from './ui/App.jsx';
render(<App />, document.getElementById('app'));
import { registerSW } from '../pwa-register.snippet.js';
registerSW(apply => window.dispatchEvent(new CustomEvent('cutline:update', { detail: apply })));
