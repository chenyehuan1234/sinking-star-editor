import React from 'react';
import {createRoot} from 'react-dom/client';
import {CommunityPanel} from '../src/renderer/community-panel';
import '../src/renderer/workbench-home.css';

createRoot(document.getElementById('root')!).render(<main className="hub-shell"><CommunityPanel/></main>);
