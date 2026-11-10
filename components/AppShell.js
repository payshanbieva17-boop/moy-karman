'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useData } from './DataProvider';
import { ConfirmProvider, Icon, Toasts } from './ui';
import TxForm from './TxForm';
import { getSupabase } from '@/lib/supabase';

const NAV = [
  { href: '/', label: 'Главная', icon: 'home' },
  { href: '/history', label: 'История', icon: 'list' },
  { href: '/income', label: 'Доходы', icon: 'income' },
  { href: '/goals', label: 'Цели', icon: 'target' },
  { href: '/analytics', label: 'Аналитика', icon: 'chart' },
  { href: '/settings', label: 'Настройки', icon: 'settings' },
];

function AuthScreen() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = getSupabase();
    try {
      if (mode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings` });
        if (error) throw error;
        setMsg({ ok: true, text: 'Письмо для смены пароля отправлено.' });
      } else if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, text: 'Аккаунт создан. Подтвердите почту по ссылке из письма и войдите.' });
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const t = err.message || '';
      setMsg({ ok: false, text: /Invalid login/i.test(t) ? 'Неверная почта или пароль' : /not confirmed/i.test(t) ? 'Почта не подтверждена — проверьте письмо' : /Signups not allowed/i.test(t) ? 'Регистрация закрыта' : t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="card auth-card">
        <div className="brand big"><span className="brand-mark"><Icon name="wallet" /></span>Мой карман</div>
        <p className="muted">Личные финансы в сомони. Данные хранятся в вашей базе и доступны с любого устройства.</p>
        <form onSubmit={submit} className="form">
          <label>Почта<input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode !== 'reset' && (
            <label>Пароль<input className="input" type="password" required minLength={8} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          )}
          {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'up' ? 'Создать аккаунт' : mode === 'reset' ? 'Отправить письмо' : 'Войти'}
          </button>
        </form>
        <div className="auth-links">
          {mode !== 'in' && <button className="link" onClick={() => setMode('in')}>У меня есть аккаунт</button>}
          {mode !== 'up' && <button className="link" onClick={() => setMode('up')}>Регистрация</button>}
          {mode !== 'reset' && <button className="link" onClick={() => setMode('reset')}>Забыли пароль?</button>}
        </div>
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div className="center-screen">{children}</div>;
}

export default function AppShell({ children }) {
  const d = useData();
  const path = usePathname();
  const [formOpen, setFormOpen] = useState(false);

  let body;
  if (!d.configured) {
    body = (
      <Center>
        <div className="card" style={{ maxWidth: 520 }}>
          <h2>Нужно подключить базу данных</h2>
          <p className="muted">Не заданы переменные NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY. Создайте файл .env.local по образцу .env.example и перезапустите приложение. Подробно — в README.md.</p>
        </div>
      </Center>
    );
  } else if (d.session === undefined || (d.session && d.loading)) {
    body = <Center><div className="spinner" aria-label="Загрузка" /></Center>;
  } else if (!d.session) {
    body = <AuthScreen />;
  } else if (d.loadError) {
    body = (
      <Center>
        <div className="card" style={{ maxWidth: 480 }}>
          <h2>Не удалось загрузить данные</h2>
          <p className="muted">{d.loadError}</p>
          <p className="muted">Ваши записи в безопасности — они хранятся в базе. Проверьте интернет и повторите.</p>
          <button className="btn primary" onClick={() => d.reload()}>Повторить</button>
        </div>
      </Center>
    );
  } else {
    body = (
      <div className="app">
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark"><Icon name="wallet" /></span>Мой карман</div>
          <nav>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`nav-item ${path === n.href ? 'on' : ''}`}>
                <Icon name={n.icon} />{n.label}
              </Link>
            ))}
          </nav>
          <button className="btn primary wide" onClick={() => setFormOpen(true)}><Icon name="plus" size={18} />Операция</button>
          <div className="sidebar-foot">
            <span className={`sync ${d.saving ? 'busy' : ''}`}>{d.saving ? 'Сохраняю…' : 'Все данные сохранены'}</span>
            <span className="muted small">{d.session.user.email}</span>
          </div>
        </aside>
        <header className="mobile-top">
          <div className="brand"><span className="brand-mark"><Icon name="wallet" /></span>Мой карман</div>
          <div className="mobile-top-links">
            <span className={`sync-dot ${d.saving ? 'busy' : ''}`} title={d.saving ? 'Сохраняю…' : 'Сохранено'} />
            <Link href="/income" className={path === '/income' ? 'on' : ''} aria-label="Доходы"><Icon name="income" /></Link>
            <Link href="/settings" className={path === '/settings' ? 'on' : ''} aria-label="Настройки"><Icon name="settings" /></Link>
          </div>
        </header>
        <main className="main">{children}</main>
        <nav className="bottom-nav">
          {NAV.filter((n) => n.href !== '/settings').slice(0, 2).map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? 'on' : ''}><Icon name={n.icon} /><span>{n.label}</span></Link>
          ))}
          <button className="fab" onClick={() => setFormOpen(true)} aria-label="Добавить операцию"><Icon name="plus" size={26} /></button>
          {NAV.filter((n) => ['/goals', '/analytics'].includes(n.href)).map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? 'on' : ''}><Icon name={n.icon} /><span>{n.label}</span></Link>
          ))}
        </nav>
        <TxForm open={formOpen} onClose={() => setFormOpen(false)} initial={null} />
      </div>
    );
  }

  return (
    <ConfirmProvider>
      {body}
      <Toasts toasts={d.toasts} dismiss={d.dismissToast} />
    </ConfirmProvider>
  );
}
