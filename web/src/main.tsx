import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { App } from './App';
import { useLocale, t } from './i18n';

/** a render error in any panel must not leave a black screen: show it, let the user retry or reload */
class Crash extends Component<{ children: ReactNode }, { error: Error | null; n: number }> {
  state = { error: null as Error | null, n: 0 };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[smashcut] UI crashed:', error); }
  render() {
    const { error, n } = this.state;
    if (!error) return <div key={n} style={{ display: 'contents' }}>{this.props.children}</div>;
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0b0b0c', color: '#e8e8e8', font: '14px Inter, system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{t('Something in the interface broke')}</div>
          <div style={{ opacity: 0.7, marginBottom: 12 }}>{t('Your project is safe. This is usually a file an agent edited by hand — try again, or reload the page.')}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#17171a', padding: 12, borderRadius: 8, maxHeight: 240, overflow: 'auto' }}>{String(error.stack || error.message).split('\n').slice(0, 8).join('\n')}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn primary" onClick={() => this.setState({ error: null, n: n + 1 })}>{t('Try again')}</button>
            <button className="btn" onClick={() => location.reload()}>{t('Reload')}</button>
          </div>
        </div>
      </div>
    );
  }
}

function Root() {
  const lang = useLocale();
  return <Crash><App key={lang} /></Crash>;
}
import { boot } from './store';

boot();
createRoot(document.getElementById('root')!).render(<Root />);
