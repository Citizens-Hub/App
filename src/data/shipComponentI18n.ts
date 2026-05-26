import { localizeShipSize, normalizeShipMetadataLocale, type ShipMetadataLocale } from './shipMetadataI18n';

type ShipComponentTranslations = Record<ShipMetadataLocale, string>;

function t(
  zhCN: string,
  zhHK: string,
  en: string,
  jaJP: string,
  deDE: string,
): ShipComponentTranslations {
  return {
    'zh-CN': zhCN,
    'zh-HK': zhHK,
    en,
    'ja-JP': jaJP,
    'de-DE': deDE,
  };
}

function same(value: string): ShipComponentTranslations {
  return t(value, value, value, value, value);
}

function decodeHtmlEntities(value?: string | null) {
  return value
    ?.replace(/&amp;/g, '&')
    .trim() || '';
}

function normalizeComponentTerm(value?: string | null) {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PLACEHOLDER_TRANSLATIONS = t('待定', '待定', 'TBD', '未定', 'TBD');

const SHIP_COMPONENT_NAME_TRANSLATIONS: Record<string, ShipComponentTranslations> = {
  'automated pds': t('自动 PDS', '自動 PDS', 'Automated PDS', '自動PDS', 'Automatisches PDS'),
  'aux joint thruster': t('辅助关节推进器', '輔助關節推進器', 'Aux Joint Thruster', '補助関節スラスター', 'Hilfs-Gelenktriebwerk'),
  'aux retro thruster': t('辅助反向推进器', '輔助反向推進器', 'Aux Retro Thruster', '補助リトロスラスター', 'Hilfs-Retrotriebwerk'),
  'aux thruster': t('辅助推进器', '輔助推進器', 'Aux Thruster', '補助スラスター', 'Hilfstriebwerk'),
  'ball maneuvering thruster': t('球形机动推进器', '球形機動推進器', 'Ball Maneuvering Thruster', '球形マニューバリングスラスター', 'Kugel-Manövertriebwerk'),
  'bespoke energy autocannon': t('专属能量自动炮', '專屬能量自動炮', 'Bespoke Energy Autocannon', '専用エネルギーオートキャノン', 'Exklusive Energie-Autokanone'),
  'bespoke hacking device tbc': t('专属黑客装置（待定）', '專屬駭入裝置（待定）', 'Bespoke Hacking Device TBC', '専用ハッキング装置（未定）', 'Exklusives Hackgerät (TBC)'),
  'bespoke s3 missile launcher': t('专属 S3 导弹发射器', '專屬 S3 飛彈發射器', 'Bespoke S3 Missile Launcher', '専用 S3 ミサイルランチャー', 'Exklusiver S3-Raketenwerfer'),
  'bespoke s4 missile launcher': t('专属 S4 导弹发射器', '專屬 S4 飛彈發射器', 'Bespoke S4 Missile Launcher', '専用 S4 ミサイルランチャー', 'Exklusiver S4-Raketenwerfer'),
  drone: t('无人机', '無人機', 'Drone', 'ドローン', 'Drohne'),
  emp: same('EMP'),
  'dual s7 turret w/ 2x s4 weapons': t('双联 S7 炮塔（配 2x S4 武器）', '雙聯 S7 炮塔（配 2x S4 武器）', 'Dual S7 Turret w/ 2x S4 Weapons', 'S7連装タレット（S4武装2門）', 'Doppelter S7-Turm mit 2x S4-Waffen'),
  'enhanced radar suite': t('强化雷达套件', '強化雷達套件', 'Enhanced Radar Suite', '強化レーダースイート', 'Verbessertes Radarpaket'),
  'engine performance booster': t('引擎性能增强器', '引擎性能增強器', 'Engine Performance Booster', 'エンジン性能ブースター', 'Triebwerksleistungs-Booster'),
  'fixed maneuvering thruster': t('固定机动推进器', '固定機動推進器', 'Fixed Maneuvering Thruster', '固定マニューバリングスラスター', 'Festes Manövertriebwerk'),
  'front turbine': t('前涡轮', '前渦輪', 'Front Turbine', '前部タービン', 'Frontturbine'),
  'gimbal maneuvering thruster': t('万向机动推进器', '萬向機動推進器', 'Gimbal Maneuvering Thruster', 'ジンバル式マニューバリングスラスター', 'Gimbal-Manövertriebwerk'),
  'gravlev plates': t('重力悬浮板', '重力懸浮板', 'Gravlev Plates', 'グラヴレヴプレート', 'Gravlev-Platten'),
  'hydrogen fuel tank': t('氢燃料箱', '氫燃料箱', 'Hydrogen Fuel Tank', '水素燃料タンク', 'Wasserstofftank'),
  'ice plunge': same('Ice Plunge'),
  'javelin torpedo launcher': t('Javelin 鱼雷发射器', 'Javelin 魚雷發射器', 'Javelin Torpedo Launcher', 'Javelin 魚雷ランチャー', 'Javelin-Torpedowerfer'),
  'joint maneuvering thrusters': t('关节机动推进器', '關節機動推進器', 'Joint Maneuvering Thrusters', '関節式マニューバリングスラスター', 'Gelenk-Manövertriebwerke'),
  'main (rotate to retro)': t('主推进器（可旋转为反向）', '主推進器（可旋轉為反向）', 'Main (rotate to retro)', 'メイン（リトロへ回転）', 'Haupttriebwerk (auf Retro drehbar)'),
  'main aux': t('主辅助单元', '主輔助單元', 'Main Aux', 'メイン補助', 'Haupt-Hilfsmodul'),
  'main aux thruster': t('主辅助推进器', '主輔助推進器', 'Main Aux Thruster', 'メイン補助スラスター', 'Haupt-Hilfstriebwerk'),
  'main front thruster': t('主前推进器', '主前推進器', 'Main Front Thruster', '前部メインスラスター', 'Vorderes Haupttriebwerk'),
  'main joint thruster': t('主关节推进器', '主關節推進器', 'Main Joint Thruster', 'メイン関節スラスター', 'Haupt-Gelenktriebwerk'),
  'main rear thurster': t('主后推进器', '主後推進器', 'Main Rear Thurster', '後部メインスラスター', 'Hinteres Haupttriebwerk'),
  'main retro thruster': t('主反向推进器', '主反向推進器', 'Main Retro Thruster', 'メインリトロスラスター', 'Haupt-Retrotriebwerk'),
  'main side thruster': t('主侧推进器', '主側推進器', 'Main Side Thruster', '側面メインスラスター', 'Seitliches Haupttriebwerk'),
  'main thruster': t('主推进器', '主推進器', 'Main Thruster', 'メインスラスター', 'Haupttriebwerk'),
  'main vtol thruster': t('主 VTOL 推进器', '主 VTOL 推進器', 'Main VTOL Thruster', 'メインVTOLスラスター', 'Haupt-VTOL-Triebwerk'),
  'manned turret': t('载人炮塔', '載人炮塔', 'Manned Turret', '有人タレット', 'Bemanntes Geschütz'),
  'manned turrets': t('载人炮塔', '載人炮塔', 'Manned Turrets', '有人タレット', 'Bemannte Geschütze'),
  'minelayer/dwp system': t('布雷 / DWP 系统', '佈雷 / DWP 系統', 'Minelayer/DWP System', '機雷敷設 / DWP システム', 'Minenleger-/DWP-System'),
  'radar scanner turret': t('雷达扫描炮塔', '雷達掃描炮塔', 'Radar Scanner Turret', 'レーダースキャナータレット', 'Radar-Scanner-Turm'),
  'rear turbine': t('后涡轮', '後渦輪', 'Rear Turbine', '後部タービン', 'Heckturbine'),
  'reliant cernan camera package': t('Reliant Cernan 摄像套件', 'Reliant Cernan 攝影套件', 'Reliant Cernan Camera Package', 'Reliant Cernan カメラパッケージ', 'Reliant Cernan-Kamerapaket'),
  'reliant samos sensor suite': t('Reliant Samos 传感套件', 'Reliant Samos 感測套件', 'Reliant Samos Sensor Suite', 'Reliant Samos センサースイート', 'Reliant Samos-Sensorsuite'),
  'remote missile turret': t('遥控导弹炮塔', '遙控飛彈炮塔', 'Remote Missile Turret', '遠隔ミサイルタレット', 'Ferngesteuerter Raketenturm'),
  'remote turret': t('遥控炮塔', '遙控炮塔', 'Remote Turret', '遠隔タレット', 'Ferngesteuerter Turm'),
  's1 (empty)': t('S1（空）', 'S1（空）', 'S1 (Empty)', 'S1（空）', 'S1 (Leer)'),
  's1 twin link remote turret': t('S1 双联遥控炮塔', 'S1 雙聯遙控炮塔', 'S1 Twin Link Remote Turret', 'S1 連装遠隔タレット', 'S1 Doppel-Fernbedienungsturm'),
  's1 custom weapon': t('S1 定制武器', 'S1 訂製武器', 'S1 Custom Weapon', 'S1 カスタム武装', 'S1 Spezialwaffe'),
  's2 missiles tbd': t('S2 导弹（待定）', 'S2 飛彈（待定）', 'S2 Missiles TBD', 'S2 ミサイル（未定）', 'S2-Raketen (TBD)'),
  's3 qed': t('S3 量子拦截器', 'S3 量子攔截器', 'S3 QED', 'S3 QED', 'S3-QED'),
  's5 laster repeaters': t('S5 激光连发炮', 'S5 鐳射連發炮', 'S5 Laster Repeaters', 'S5 レーザーリピーター', 'S5 Laser-Repeater'),
  's7 manned turret forward-facing': t('S7 前向载人炮塔', 'S7 前向載人炮塔', 'S7 Manned Turret Forward-Facing', 'S7 前方向有人タレット', 'S7 Front-Bemanntes Geschütz'),
  'size 0 mining head': t('0 号采矿头', '0 號採礦頭', 'Size 0 Mining head', 'サイズ0採掘ヘッド', 'Größe-0-Bergbaukopf'),
  'stor-all big cargo box': t('Stor-All 大型货箱', 'Stor-All 大型貨箱', 'Stor-All Big Cargo Box', 'Stor-All 大型カーゴボックス', 'Stor-All große Frachtbox'),
  'stor-all mini cargo box': t('Stor-All 迷你货箱', 'Stor-All 迷你貨箱', 'Stor-All Mini Cargo Box', 'Stor-All ミニカーゴボックス', 'Stor-All Mini-Frachtbox'),
  stronghold: same('Stronghold'),
  sunflare: same('Sunflare'),
  targa: same('Targa'),
  'tbc countermeasures': t('对抗措施（待定）', '對抗措施（待定）', 'TBC Countermeasures', '対抗手段（未定）', 'Gegenmaßnahmen (TBC)'),
  tbd: PLACEHOLDER_TRANSLATIONS,
  'tbd maneuvering thruster': t('待定机动推进器', '待定機動推進器', 'TBD Maneuvering Thruster', '未定マニューバリングスラスター', 'Manövertriebwerk (TBD)'),
  'tbd missile': t('待定导弹', '待定飛彈', 'TBD Missile', '未定ミサイル', 'Rakete (TBD)'),
  'tevarin shield': t('Tevarin 护盾', 'Tevarin 護盾', 'Tevarin Shield', 'Tevarin シールド', 'Tevarin-Schild'),
  'tier 3 med bed': t('三级医疗床', '三級醫療床', 'Tier 3 Med Bed', 'Tier 3医療ベッド', 'Med-Bett Stufe 3'),
  'tractor/salvage beam combo': t('牵引 / 回收光束组合', '牽引 / 回收光束組合', 'Tractor/Salvage Beam Combo', 'トラクター / サルベージビーム複合', 'Traktor-/Bergungsstrahl-Kombi'),
  'vtol / retro': t('VTOL / 反向', 'VTOL / 反向', 'VTOL / Retro', 'VTOL / リトロ', 'VTOL / Retro'),
  'weapon tbc': t('武器（待定）', '武器（待定）', 'Weapon TBC', '武装（未定）', 'Waffe (TBC)'),
};

const SHIP_COMPONENT_SUFFIX_TRANSLATIONS: Array<[string, ShipComponentTranslations]> = [
  ['traktor/salvage beam combo', t('牵引 / 回收光束组合', '牽引 / 回收光束組合', 'Tractor/Salvage Beam Combo', 'トラクター / サルベージビーム複合', 'Traktor-/Bergungsstrahl-Kombi')],
  ['remote missile turret', t('遥控导弹炮塔', '遙控飛彈炮塔', 'Remote Missile Turret', '遠隔ミサイルタレット', 'Ferngesteuerter Raketenturm')],
  ['radar scanner turret', t('雷达扫描炮塔', '雷達掃描炮塔', 'Radar Scanner Turret', 'レーダースキャナータレット', 'Radar-Scanner-Turm')],
  ['quantum fuel tank', t('量子燃料箱', '量子燃料箱', 'Quantum Fuel Tank', '量子燃料タンク', 'Quantentreibstofftank')],
  ['quantum dampener', t('量子拦截器', '量子攔截器', 'Quantum Dampener', '量子ダンパー', 'Quantendämpfer')],
  ['hydrogen fuel tank', t('氢燃料箱', '氫燃料箱', 'Hydrogen Fuel Tank', '水素燃料タンク', 'Wasserstofftank')],
  ['shield generator', t('护盾发生器', '護盾產生器', 'Shield Generator', 'シールドジェネレーター', 'Schildgenerator')],
  ['fuel intake', t('进气口', '進氣口', 'Fuel Intake', '燃料インテーク', 'Lufteinlass')],
  ['fuel tank', t('燃料箱', '燃料箱', 'Fuel Tank', '燃料タンク', 'Treibstofftank')],
  ['quantum drive', t('量子引擎', '量子引擎', 'Quantum Drive', '量子ドライブ', 'Quantenantrieb')],
  ['power plant', t('发电机', '發電機', 'Power Plant', 'パワープラント', 'Kraftwerk')],
  ['jump module', t('跳跃模块', '跳躍模組', 'Jump Module', 'ジャンプモジュール', 'Sprungmodul')],
  ['gravlev plates', t('重力悬浮板', '重力懸浮板', 'Gravlev Plates', 'グラヴレヴプレート', 'Gravlev-Platten')],
  ['mining laser', t('采矿激光', '採礦雷射', 'Mining Laser', '採掘レーザー', 'Bergbaulaser')],
  ['tractor beam', t('牵引光束', '牽引光束', 'Tractor Beam', 'トラクタービーム', 'Traktorstrahl')],
  ['salvage beam', t('回收光束', '回收光束', 'Salvage Beam', 'サルベージビーム', 'Bergungsstrahl')],
  ['repair arm', t('维修臂', '維修臂', 'Repair Arm', '修理アーム', 'Reparaturarm')],
  ['salvage arm', t('回收臂', '回收臂', 'Salvage Arm', 'サルベージアーム', 'Bergungsarm')],
  ['camera package', t('摄像套件', '攝影套件', 'Camera Package', 'カメラパッケージ', 'Kamerapaket')],
  ['sensor suite', t('传感套件', '感測套件', 'Sensor Suite', 'センサースイート', 'Sensorsuite')],
  ['missile launcher', t('导弹发射器', '飛彈發射器', 'Missile Launcher', 'ミサイルランチャー', 'Raketenwerfer')],
  ['torpedo launcher', t('鱼雷发射器', '魚雷發射器', 'Torpedo Launcher', '魚雷ランチャー', 'Torpedowerfer')],
  ['energy autocannon', t('能量自动炮', '能量自動炮', 'Energy Autocannon', 'エネルギーオートキャノン', 'Energie-Autokanone')],
  ['ballistic gatling', t('弹道加特林', '彈道加特林', 'Ballistic Gatling', 'バリスティックガトリング', 'Ballistische Gatling')],
  ['laser cannon', t('激光炮', '鐳射炮', 'Laser Cannon', 'レーザーキャノン', 'Laserkanone')],
  ['plasma cannon', t('等离子炮', '等離子炮', 'Plasma Cannon', 'プラズマキャノン', 'Plasmakanone')],
  ['neutron cannon', t('中子炮', '中子炮', 'Neutron Cannon', '中性子砲', 'Neutronenkanone')],
  ['mass driver', t('质量炮', '質量炮', 'Mass Driver', 'マスドライバー', 'Massentreiber')],
  ['remote turret', t('遥控炮塔', '遙控炮塔', 'Remote Turret', '遠隔タレット', 'Ferngesteuerter Turm')],
  ['manned turrets', t('载人炮塔', '載人炮塔', 'Manned Turrets', '有人タレット', 'Bemannte Geschütze')],
  ['manned turret', t('载人炮塔', '載人炮塔', 'Manned Turret', '有人タレット', 'Bemanntes Geschütz')],
  ['maneuvering thrusters', t('机动推进器', '機動推進器', 'Maneuvering Thrusters', 'マニューバリングスラスター', 'Manövertriebwerke')],
  ['maneuvering thruster', t('机动推进器', '機動推進器', 'Maneuvering Thruster', 'マニューバリングスラスター', 'Manövertriebwerk')],
  ['retro thruster', t('反向推进器', '反向推進器', 'Retro Thruster', 'リトロスラスター', 'Retrotriebwerk')],
  ['vtol thruster', t('VTOL 推进器', 'VTOL 推進器', 'VTOL Thruster', 'VTOLスラスター', 'VTOL-Triebwerk')],
  ['main thruster', t('主推进器', '主推進器', 'Main Thruster', 'メインスラスター', 'Haupttriebwerk')],
  ['thrusters', t('推进器', '推進器', 'Thrusters', 'スラスター', 'Triebwerke')],
  ['thruster', t('推进器', '推進器', 'Thruster', 'スラスター', 'Triebwerk')],
  ['turbine', t('涡轮', '渦輪', 'Turbine', 'タービン', 'Turbine')],
  ['scanner', t('扫描器', '掃描器', 'Scanner', 'スキャナー', 'Scanner')],
  ['radar suite', t('雷达套件', '雷達套件', 'Radar Suite', 'レーダースイート', 'Radarpaket')],
  ['radar', t('雷达', '雷達', 'Radar', 'レーダー', 'Radar')],
  ['emp device', t('EMP 装置', 'EMP 裝置', 'EMP Device', 'EMP装置', 'EMP-Gerät')],
  ['countermeasures', t('对抗措施', '對抗措施', 'Countermeasures', '対抗手段', 'Gegenmaßnahmen')],
  ['computer', t('计算机', '計算機', 'Computer', 'コンピューター', 'Computer')],
  ['coolers', t('散热器', '散熱器', 'Coolers', 'クーラー', 'Kühler')],
  ['cooler', t('散热器', '散熱器', 'Cooler', 'クーラー', 'Kühler')],
  ['empty mount', t('空挂点', '空掛點', 'Empty Mount', '空マウント', 'Leere Halterung')],
  ['cargo box', t('货箱', '貨箱', 'Cargo Box', 'カーゴボックス', 'Frachtbox')],
  ['med bed', t('医疗床', '醫療床', 'Med Bed', '医療ベッド', 'Med-Bett')],
  ['rockets', t('火箭弹', '火箭彈', 'Rockets', 'ロケット', 'Raketen')],
  ['weapon', t('武器', '武器', 'Weapon', '武装', 'Waffe')],
  ['weapons', t('武器', '武器', 'Weapons', '武装', 'Waffen')],
  ['missiles', t('导弹', '飛彈', 'Missiles', 'ミサイル', 'Raketen')],
  ['missile', t('导弹', '飛彈', 'Missile', 'ミサイル', 'Rakete')],
  ['bombs', t('炸弹', '炸彈', 'Bombs', '爆弾', 'Bomben')],
  ['bomb', t('炸弹', '炸彈', 'Bomb', '爆弾', 'Bombe')],
  ['torpedos', t('鱼雷', '魚雷', 'Torpedos', '魚雷', 'Torpedos')],
  ['torpedo', t('鱼雷', '魚雷', 'Torpedo', '魚雷', 'Torpedo')],
  ['shield', t('护盾', '護盾', 'Shield', 'シールド', 'Schild')],
  ['refuel arm', t('加油臂', '加油臂', 'Refuel Arm', '給油アーム', 'Betankungsarm')],
];

const SHIP_COMPONENT_DETAIL_TRANSLATIONS: Record<string, ShipComponentTranslations> = {
  manned: t('载人', '載人', 'Manned', '有人', 'Bemannt'),
  remote: t('遥控', '遙控', 'Remote', '遠隔', 'Ferngesteuert'),
  pilot: t('驾驶员', '駕駛員', 'Pilot', 'パイロット', 'Pilot'),
  copilot: t('副驾驶', '副駕駛', 'Copilot', '副操縦士', 'Copilot'),
  'co-pilot': t('副驾驶', '副駕駛', 'Co-pilot', '副操縦士', 'Co-Pilot'),
  driver: t('驾驶员', '駕駛員', 'Driver', 'ドライバー', 'Fahrer'),
  gunner: t('炮手', '炮手', 'Gunner', 'ガンナー', 'Schütze'),
  operator: t('操作员', '操作員', 'Operator', 'オペレーター', 'Bediener'),
  'turret operator': t('炮塔操作员', '炮塔操作員', 'Turret Operator', 'タレットオペレーター', 'Turmbediener'),
  'pilot controlled': t('驾驶员控制', '駕駛員控制', 'Pilot Controlled', 'パイロット操作', 'Vom Piloten gesteuert'),
  'copilot controlled': t('副驾驶控制', '副駕駛控制', 'Copilot Controlled', '副操縦士操作', 'Vom Copiloten gesteuert'),
};

function resolveComponentSuffixTranslation(value: string, locale: ShipMetadataLocale) {
  const normalizedValue = normalizeComponentTerm(value);

  for (const [suffix, translations] of SHIP_COMPONENT_SUFFIX_TRANSLATIONS) {
    if (!normalizedValue.endsWith(suffix)) {
      continue;
    }

    const prefix = decodeHtmlEntities(value).slice(0, decodeHtmlEntities(value).length - suffix.length).trimEnd();
    const localizedSuffix = translations[locale] || translations.en;
    return prefix ? `${prefix} ${localizedSuffix}` : localizedSuffix;
  }

  return '';
}

export function localizeShipComponentName(locale: string, value?: string | null) {
  const rawValue = decodeHtmlEntities(value);
  if (!rawValue) return '';

  const resolvedLocale = normalizeShipMetadataLocale(locale);
  const normalizedKey = normalizeComponentTerm(rawValue);
  const exactTranslations = SHIP_COMPONENT_NAME_TRANSLATIONS[normalizedKey];

  if (exactTranslations) {
    return exactTranslations[resolvedLocale] || exactTranslations.en;
  }

  return resolveComponentSuffixTranslation(rawValue, resolvedLocale) || rawValue;
}

export function localizeShipComponentSize(locale: string, value?: string | null) {
  const rawValue = decodeHtmlEntities(value);
  if (!rawValue) return '';

  const normalizedKey = normalizeComponentTerm(rawValue);
  if (/^\d+$/.test(rawValue)) {
    return rawValue;
  }
  if (normalizedKey === 'tbd') {
    return PLACEHOLDER_TRANSLATIONS[normalizeShipMetadataLocale(locale)];
  }

  return localizeShipSize(locale, rawValue);
}

export function localizeShipComponentManufacturer(locale: string, value?: string | null) {
  const rawValue = decodeHtmlEntities(value);
  if (!rawValue) return '';

  const normalizedKey = normalizeComponentTerm(rawValue);
  if (normalizedKey === 'tbd') {
    return PLACEHOLDER_TRANSLATIONS[normalizeShipMetadataLocale(locale)];
  }

  return rawValue;
}

function localizeShipComponentDetailToken(locale: ShipMetadataLocale, value: string) {
  const normalizedKey = normalizeComponentTerm(value);
  const exactTranslations = SHIP_COMPONENT_DETAIL_TRANSLATIONS[normalizedKey];

  if (exactTranslations) {
    return exactTranslations[locale] || exactTranslations.en;
  }

  return localizeShipComponentName(locale, value) || value;
}

export function localizeShipComponentDetails(locale: string, value?: string | null) {
  const rawValue = decodeHtmlEntities(value);
  if (!rawValue) return '';

  const resolvedLocale = normalizeShipMetadataLocale(locale);
  const normalizedKey = normalizeComponentTerm(rawValue);
  const exactTranslations = SHIP_COMPONENT_DETAIL_TRANSLATIONS[normalizedKey];

  if (exactTranslations) {
    return exactTranslations[resolvedLocale] || exactTranslations.en;
  }

  const slashSeparatedSegments = rawValue.split(/\s*\/\s*/).filter(Boolean);
  if (slashSeparatedSegments.length > 1) {
    const localizedSegments = slashSeparatedSegments.map((segment) =>
      localizeShipComponentDetailToken(resolvedLocale, segment),
    );

    if (localizedSegments.some((segment, index) => segment !== slashSeparatedSegments[index])) {
      return localizedSegments.join(' / ');
    }
  }

  return localizeShipComponentDetailToken(resolvedLocale, rawValue);
}
