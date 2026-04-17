import { normalizeShipMetadataLocale, type ShipMetadataLocale } from './shipMetadataI18n';

export type ShipDataLabelKey =
  | 'manufacturer'
  | 'focus'
  | 'type'
  | 'size'
  | 'status'
  | 'crew'
  | 'cargo'
  | 'scmSpeed'
  | 'afterburner'
  | 'dimensions'
  | 'msrp'
  | 'weapons'
  | 'turrets'
  | 'avionics'
  | 'modular'
  | 'propulsions'
  | 'thrusters';

const SHIP_DATA_LABEL_TRANSLATIONS: Record<ShipDataLabelKey, Record<ShipMetadataLocale, string>> = {
  manufacturer: { 'zh-CN': '制造商', 'zh-HK': '製造商', en: 'Manufacturer', 'ja-JP': 'メーカー', 'de-DE': 'Hersteller' },
  focus: { 'zh-CN': '定位 / 职能', 'zh-HK': '定位 / 職能', en: 'Role / Focus', 'ja-JP': '役割 / フォーカス', 'de-DE': 'Rolle / Fokus' },
  type: { 'zh-CN': '类型', 'zh-HK': '類型', en: 'Type', 'ja-JP': 'タイプ', 'de-DE': 'Typ' },
  size: { 'zh-CN': '尺寸', 'zh-HK': '尺寸', en: 'Size', 'ja-JP': 'サイズ', 'de-DE': 'Größe' },
  status: { 'zh-CN': '状态', 'zh-HK': '狀態', en: 'Status', 'ja-JP': '状態', 'de-DE': 'Status' },
  crew: { 'zh-CN': '船员', 'zh-HK': '船員', en: 'Crew', 'ja-JP': '乗員', 'de-DE': 'Besatzung' },
  cargo: { 'zh-CN': '货运', 'zh-HK': '貨運', en: 'Cargo', 'ja-JP': '貨物', 'de-DE': 'Fracht' },
  scmSpeed: { 'zh-CN': 'SCM 速度', 'zh-HK': 'SCM 速度', en: 'SCM Speed', 'ja-JP': 'SCM 速度', 'de-DE': 'SCM-Geschwindigkeit' },
  afterburner: { 'zh-CN': '加力速度', 'zh-HK': '加力速度', en: 'Afterburner', 'ja-JP': 'アフターバーナー', 'de-DE': 'Nachbrenner' },
  dimensions: { 'zh-CN': '尺寸规格', 'zh-HK': '尺寸規格', en: 'Dimensions', 'ja-JP': '寸法', 'de-DE': 'Abmessungen' },
  msrp: { 'zh-CN': '官方售价', 'zh-HK': '官方售價', en: 'MSRP', 'ja-JP': '定価', 'de-DE': 'UVP' },
  weapons: { 'zh-CN': '武器', 'zh-HK': '武器', en: 'Weapons', 'ja-JP': '武装', 'de-DE': 'Waffen' },
  turrets: { 'zh-CN': '炮塔', 'zh-HK': '炮塔', en: 'Turrets', 'ja-JP': 'タレット', 'de-DE': 'Geschütztürme' },
  avionics: { 'zh-CN': '航电', 'zh-HK': '航電', en: 'Avionics', 'ja-JP': 'アビオニクス', 'de-DE': 'Avionik' },
  modular: { 'zh-CN': '模块', 'zh-HK': '模組', en: 'Modular', 'ja-JP': 'モジュール', 'de-DE': 'Module' },
  propulsions: { 'zh-CN': '推进系统', 'zh-HK': '推進系統', en: 'Propulsions', 'ja-JP': '推進系', 'de-DE': 'Antriebssysteme' },
  thrusters: { 'zh-CN': '推进器', 'zh-HK': '推進器', en: 'Thrusters', 'ja-JP': 'スラスター', 'de-DE': 'Triebwerke' },
};

export function localizeShipDataLabel(locale: string, key: ShipDataLabelKey) {
  const resolvedLocale = normalizeShipMetadataLocale(locale);
  return SHIP_DATA_LABEL_TRANSLATIONS[key][resolvedLocale] || SHIP_DATA_LABEL_TRANSLATIONS[key].en;
}
