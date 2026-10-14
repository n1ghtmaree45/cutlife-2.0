import { House, LineChart, Plus, Utensils, Settings } from 'lucide-preact';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';
export function TabBar({ route }) {
  const tabs = [
    { href: '#/', label: t('tab.today'), Icon: House },
    { href: '#/weight', label: t('tab.weight'), Icon: LineChart },
    { href: '#/log', label: t('tab.log'), Icon: Plus, fab: true },
    { href: '#/ideas', label: t('tab.meals'), Icon: Utensils },
    { href: '#/settings', label: t('tab.settings'), Icon: Settings },
  ];
  return (
    <nav class="tabbar" aria-label={t('tab.main')}><div class="tabbar__inner">
      {tabs.map(({ href, label, Icon, fab }) => fab ? (
        <a class="tab tab--fab" href={href} aria-label={t('tab.log_aria')} onClick={() => haptic(10)}><span class="fab"><Icon size={24} strokeWidth={2.25} /></span></a>
      ) : (
        <a class="tab" href={href} style={{ textDecoration: 'none' }} aria-current={route === href.slice(1) ? 'page' : undefined}>
          <Icon size={22} strokeWidth={1.75} />{label}
        </a>
      ))}
    </div></nav>
  );
}
