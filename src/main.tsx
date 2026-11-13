/**
 * 应用入口：只做挂载，不含任何业务逻辑或数据。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  // 宁可炸得明白，也不要在控制台留一个空页面
  throw new Error('index.html 缺少 #root 挂载点，无法启动 BinAtlas');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
