// The preview build's entry: the real app, in guest mode, with example data (see README).
// Import order matters: the clock shift and the first-visit seed both have to happen before
// the app's store module reads the clock and localStorage.
import { clockShifted } from './clock.js'
import './boot.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PreviewMenu from './PreviewMenu.jsx'
import App from '../../frontend/src/App.jsx'
import '../../frontend/src/index.css'
import './preview.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /><PreviewMenu /></StrictMode>
)
if (clockShifted) document.documentElement.classList.add('pv-night')
