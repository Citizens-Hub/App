import type { Ship } from '@/types';

export type ShipMetadataLocale = 'zh-CN' | 'zh-HK' | 'en' | 'ja-JP' | 'de-DE';
export type ShipMetadataGroup = 'type' | 'size' | 'status' | 'focus';

type ShipMetadataTranslations = Record<ShipMetadataLocale, string>;
type ShipMetadataTranslationMap = Record<string, ShipMetadataTranslations>;
type ShipMetadataAliasMap = Record<ShipMetadataGroup, Record<string, string>>;

export interface ShipMetadataEntry {
  rawValue: string;
  normalizedKey: string;
  canonicalKey: string;
  translations?: ShipMetadataTranslations;
}

export const SUPPORTED_SHIP_METADATA_LOCALES: ShipMetadataLocale[] = ['zh-CN', 'zh-HK', 'en', 'ja-JP', 'de-DE'];

const SHIP_TYPE_TRANSLATIONS: ShipMetadataTranslationMap = {
  combat: { 'zh-CN': '战斗', 'zh-HK': '戰鬥', en: 'Combat', 'ja-JP': '戦闘', 'de-DE': 'Kampf' },
  competition: { 'zh-CN': '竞赛', 'zh-HK': '競賽', en: 'Competition', 'ja-JP': '競技', 'de-DE': 'Wettkampf' },
  exploration: { 'zh-CN': '探索', 'zh-HK': '探索', en: 'Exploration', 'ja-JP': '探査', 'de-DE': 'Erkundung' },
  ground: { 'zh-CN': '地面', 'zh-HK': '地面', en: 'Ground', 'ja-JP': '地上', 'de-DE': 'Boden' },
  industrial: { 'zh-CN': '工业', 'zh-HK': '工業', en: 'Industrial', 'ja-JP': '産業', 'de-DE': 'Industrie' },
  multi: { 'zh-CN': '多用途', 'zh-HK': '多用途', en: 'Multi', 'ja-JP': '多目的', 'de-DE': 'Mehrzweck' },
  support: { 'zh-CN': '支援', 'zh-HK': '支援', en: 'Support', 'ja-JP': '支援', 'de-DE': 'Unterstützung' },
  transport: { 'zh-CN': '运输', 'zh-HK': '運輸', en: 'Transport', 'ja-JP': '輸送', 'de-DE': 'Transport' },
};

const SHIP_SIZE_TRANSLATIONS: ShipMetadataTranslationMap = {
  vehicle: { 'zh-CN': '载具级', 'zh-HK': '載具級', en: 'Vehicle', 'ja-JP': '車両級', 'de-DE': 'Fahrzeug' },
  snub: { 'zh-CN': '寄生级', 'zh-HK': '寄生級', en: 'Snub', 'ja-JP': 'スナブ級', 'de-DE': 'Snub' },
  small: { 'zh-CN': '小型', 'zh-HK': '小型', en: 'Small', 'ja-JP': '小型', 'de-DE': 'Klein' },
  medium: { 'zh-CN': '中型', 'zh-HK': '中型', en: 'Medium', 'ja-JP': '中型', 'de-DE': 'Mittel' },
  large: { 'zh-CN': '大型', 'zh-HK': '大型', en: 'Large', 'ja-JP': '大型', 'de-DE': 'Groß' },
  'sub capital': { 'zh-CN': '亚主力舰级', 'zh-HK': '亞主力艦級', en: 'Sub Capital', 'ja-JP': '準主力艦級', 'de-DE': 'Unter-Großkampfschiff' },
  capital: { 'zh-CN': '主力舰级', 'zh-HK': '主力艦級', en: 'Capital', 'ja-JP': '主力艦級', 'de-DE': 'Großkampfschiff' },
  'extra large': { 'zh-CN': '超大型', 'zh-HK': '超大型', en: 'Extra Large', 'ja-JP': '超大型', 'de-DE': 'Extra groß' },
};

const SHIP_STATUS_TRANSLATIONS: ShipMetadataTranslationMap = {
  concept: { 'zh-CN': '概念', 'zh-HK': '概念', en: 'Concept', 'ja-JP': 'コンセプト', 'de-DE': 'Konzept' },
  flyable: { 'zh-CN': '可飞', 'zh-HK': '可飛行', en: 'Flyable', 'ja-JP': '飛行可能', 'de-DE': 'Flugfähig' },
  'flyable soon': { 'zh-CN': '即将可飞', 'zh-HK': '即將可飛行', en: 'Flyable Soon', 'ja-JP': 'まもなく飛行可能', 'de-DE': 'Bald flugfähig' },
  'flight ready': { 'zh-CN': '飞行就绪', 'zh-HK': '飛行就緒', en: 'Flight Ready', 'ja-JP': '飛行準備完了', 'de-DE': 'Flugbereit' },
  'in production': { 'zh-CN': '开发中', 'zh-HK': '開發中', en: 'In Production', 'ja-JP': '開発中', 'de-DE': 'In Entwicklung' },
  tbd: { 'zh-CN': '尚未实装', 'zh-HK': '尚未實裝', en: 'Not Implemented Yet', 'ja-JP': '未実装', 'de-DE': 'Noch nicht implementiert' },
};

const SHIP_FOCUS_TRANSLATIONS: ShipMetadataTranslationMap = {
  ambulance: { 'zh-CN': '救护', 'zh-HK': '救護', en: 'Ambulance', 'ja-JP': '救急', 'de-DE': 'Ambulanz' },
  'anti aircraft': { 'zh-CN': '防空', 'zh-HK': '防空', en: 'Anti-aircraft', 'ja-JP': '対空', 'de-DE': 'Flugabwehr' },
  'armored freight': { 'zh-CN': '装甲货运', 'zh-HK': '裝甲貨運', en: 'Armored Freight', 'ja-JP': '装甲貨物輸送', 'de-DE': 'Gepanzerter Frachter' },
  assault: { 'zh-CN': '强袭', 'zh-HK': '強襲', en: 'Assault', 'ja-JP': '強襲', 'de-DE': 'Sturmangriff' },
  boarding: { 'zh-CN': '登舰作战', 'zh-HK': '登艦作戰', en: 'Boarding', 'ja-JP': '強行乗艦', 'de-DE': 'Enterkommando' },
  bomber: { 'zh-CN': '轰炸', 'zh-HK': '轟炸', en: 'Bomber', 'ja-JP': '爆撃', 'de-DE': 'Bomber' },
  cargo: { 'zh-CN': '货运', 'zh-HK': '貨運', en: 'Cargo', 'ja-JP': '貨物', 'de-DE': 'Fracht' },
  'cargo loader': { 'zh-CN': '货物装载', 'zh-HK': '貨物裝載', en: 'Cargo Loader', 'ja-JP': '貨物ローダー', 'de-DE': 'Frachtlader' },
  combat: { 'zh-CN': '战斗', 'zh-HK': '戰鬥', en: 'Combat', 'ja-JP': '戦闘', 'de-DE': 'Kampf' },
  'combat support': { 'zh-CN': '战斗支援', 'zh-HK': '戰鬥支援', en: 'Combat Support', 'ja-JP': '戦闘支援', 'de-DE': 'Kampfunterstützung' },
  'combat / cargo': { 'zh-CN': '战斗 / 货运', 'zh-HK': '戰鬥 / 貨運', en: 'Combat / Cargo', 'ja-JP': '戦闘 / 貨物輸送', 'de-DE': 'Kampf / Fracht' },
  'combined arms platform': { 'zh-CN': '联合作战平台', 'zh-HK': '聯合作戰平台', en: 'Combined Arms Platform', 'ja-JP': '諸兵科連合プラットフォーム', 'de-DE': 'Verbundwaffen-Plattform' },
  corvette: { 'zh-CN': '护卫舰', 'zh-HK': '護衛艦', en: 'Corvette', 'ja-JP': 'コルベット', 'de-DE': 'Korvette' },
  destroyer: { 'zh-CN': '驱逐舰', 'zh-HK': '驅逐艦', en: 'Destroyer', 'ja-JP': '駆逐艦', 'de-DE': 'Zerstörer' },
  dropship: { 'zh-CN': '空降运输', 'zh-HK': '空降運輸', en: 'Dropship', 'ja-JP': '降下艇', 'de-DE': 'Landungsschiff' },
  expedition: { 'zh-CN': '远征', 'zh-HK': '遠征', en: 'Expedition', 'ja-JP': '遠征', 'de-DE': 'Expedition' },
  exploration: { 'zh-CN': '探索', 'zh-HK': '探索', en: 'Exploration', 'ja-JP': '探索', 'de-DE': 'Erkundung' },
  'exploration / recon': { 'zh-CN': '探索 / 侦察', 'zh-HK': '探索 / 偵察', en: 'Exploration / Recon', 'ja-JP': '探索 / 偵察', 'de-DE': 'Erkundung / Aufklärung' },
  freight: { 'zh-CN': '货运', 'zh-HK': '貨運', en: 'Freight', 'ja-JP': '貨物輸送', 'de-DE': 'Frachttransport' },
  frigate: { 'zh-CN': '护卫舰', 'zh-HK': '護衛艦', en: 'Frigate', 'ja-JP': 'フリゲート', 'de-DE': 'Fregatte' },
  generalist: { 'zh-CN': '通用', 'zh-HK': '通用', en: 'Generalist', 'ja-JP': '汎用', 'de-DE': 'Allrounder' },
  'gun ship': { 'zh-CN': '炮艇', 'zh-HK': '砲艇', en: 'Gun Ship', 'ja-JP': 'ガンシップ', 'de-DE': 'Kanonenschiff' },
  gunboat: { 'zh-CN': '炮艇', 'zh-HK': '砲艇', en: 'Gunboat', 'ja-JP': '砲艦', 'de-DE': 'Kanonenboot' },
  gunship: { 'zh-CN': '武装炮艇', 'zh-HK': '武裝砲艇', en: 'Gunship', 'ja-JP': 'ガンシップ', 'de-DE': 'Gunship' },
  'heavy bomber': { 'zh-CN': '重型轰炸', 'zh-HK': '重型轟炸', en: 'Heavy Bomber', 'ja-JP': '重爆撃', 'de-DE': 'Schwerer Bomber' },
  'heavy construction': { 'zh-CN': '重型建造', 'zh-HK': '重型建造', en: 'Heavy Construction', 'ja-JP': '重建設', 'de-DE': 'Schwerbau' },
  'heavy fighter': { 'zh-CN': '重型战斗', 'zh-HK': '重型戰鬥', en: 'Heavy Fighter', 'ja-JP': '重戦闘', 'de-DE': 'Schwerer Jäger' },
  'heavy freight': { 'zh-CN': '重型货运', 'zh-HK': '重型貨運', en: 'Heavy Freight', 'ja-JP': '重貨物輸送', 'de-DE': 'Schwerer Frachter' },
  'heavy gun ship': { 'zh-CN': '重型炮艇', 'zh-HK': '重型砲艇', en: 'Heavy Gun Ship', 'ja-JP': '重ガンシップ', 'de-DE': 'Schweres Kanonenschiff' },
  'heavy mining': { 'zh-CN': '重型采矿', 'zh-HK': '重型採礦', en: 'Heavy Mining', 'ja-JP': '重採掘', 'de-DE': 'Schwerer Bergbau' },
  'heavy refuelling': { 'zh-CN': '重型加油', 'zh-HK': '重型加油', en: 'Heavy Refuelling', 'ja-JP': '重補給', 'de-DE': 'Schwere Betankung' },
  'heavy repair': { 'zh-CN': '重型维修', 'zh-HK': '重型維修', en: 'Heavy Repair', 'ja-JP': '重整備', 'de-DE': 'Schwere Reparatur' },
  'heavy salvage': { 'zh-CN': '重型回收', 'zh-HK': '重型回收', en: 'Heavy Salvage', 'ja-JP': '重サルベージ', 'de-DE': 'Schwere Bergung' },
  'heavy science': { 'zh-CN': '重型科研', 'zh-HK': '重型科研', en: 'Heavy Science', 'ja-JP': '重科学調査', 'de-DE': 'Schwere Forschung' },
  industrial: { 'zh-CN': '工业', 'zh-HK': '工業', en: 'Industrial', 'ja-JP': '産業', 'de-DE': 'Industrie' },
  interdiction: { 'zh-CN': '拦截', 'zh-HK': '攔截', en: 'Interdiction', 'ja-JP': '阻止', 'de-DE': 'Abriegelung' },
  'interdiction / light fighter': { 'zh-CN': '拦截 / 轻型战斗', 'zh-HK': '攔截 / 輕型戰鬥', en: 'Interdiction / Light Fighter', 'ja-JP': '阻止 / 軽戦闘', 'de-DE': 'Abriegelung / Leichter Jäger' },
  interdictor: { 'zh-CN': '拦截舰', 'zh-HK': '攔截艦', en: 'Interdictor', 'ja-JP': 'インターディクター', 'de-DE': 'Interdiktor' },
  'light carrier': { 'zh-CN': '轻型航母', 'zh-HK': '輕型航母', en: 'Light Carrier', 'ja-JP': '軽空母', 'de-DE': 'Leichter Träger' },
  'light fighter': { 'zh-CN': '轻型战斗', 'zh-HK': '輕型戰鬥', en: 'Light Fighter', 'ja-JP': '軽戦闘', 'de-DE': 'Leichter Jäger' },
  'light freight': { 'zh-CN': '轻型货运', 'zh-HK': '輕型貨運', en: 'Light Freight', 'ja-JP': '軽貨物輸送', 'de-DE': 'Leichter Frachter' },
  'light salvage': { 'zh-CN': '轻型回收', 'zh-HK': '輕型回收', en: 'Light Salvage', 'ja-JP': '軽サルベージ', 'de-DE': 'Leichte Bergung' },
  'light science': { 'zh-CN': '轻型科研', 'zh-HK': '輕型科研', en: 'Light Science', 'ja-JP': '軽科学調査', 'de-DE': 'Leichte Forschung' },
  luxury: { 'zh-CN': '豪华', 'zh-HK': '豪華', en: 'Luxury', 'ja-JP': '高級', 'de-DE': 'Luxus' },
  'luxury / touring': { 'zh-CN': '豪华 / 旅行', 'zh-HK': '豪華 / 旅行', en: 'Luxury / Touring', 'ja-JP': '高級 / ツーリング', 'de-DE': 'Luxus / Touring' },
  'luxury touring': { 'zh-CN': '豪华旅行', 'zh-HK': '豪華旅行', en: 'Luxury Touring', 'ja-JP': '高級ツーリング', 'de-DE': 'Luxus-Touring' },
  'luxury transport / explorer': { 'zh-CN': '豪华运输 / 探索', 'zh-HK': '豪華運輸 / 探索', en: 'Luxury Transport / Explorer', 'ja-JP': '高級輸送 / 探索', 'de-DE': 'Luxustransport / Erkundung' },
  medical: { 'zh-CN': '医疗', 'zh-HK': '醫療', en: 'Medical', 'ja-JP': '医療', 'de-DE': 'Medizinisch' },
  'medium cargo / medium data': { 'zh-CN': '中型货运 / 中型数据', 'zh-HK': '中型貨運 / 中型數據', en: 'Medium Cargo / Medium Data', 'ja-JP': '中貨物 / 中データ', 'de-DE': 'Mittlere Fracht / Mittlere Daten' },
  'medium data': { 'zh-CN': '中型数据', 'zh-HK': '中型數據', en: 'Medium Data', 'ja-JP': '中データ', 'de-DE': 'Mittlere Daten' },
  'medium fighter': { 'zh-CN': '中型战斗', 'zh-HK': '中型戰鬥', en: 'Medium Fighter', 'ja-JP': '中戦闘', 'de-DE': 'Mittlerer Jäger' },
  'medium fighter / medium freight': { 'zh-CN': '中型战斗 / 中型货运', 'zh-HK': '中型戰鬥 / 中型貨運', en: 'Medium Fighter / Medium Freight', 'ja-JP': '中戦闘 / 中貨物輸送', 'de-DE': 'Mittlerer Jäger / Mittlerer Frachter' },
  'medium freight': { 'zh-CN': '中型货运', 'zh-HK': '中型貨運', en: 'Medium Freight', 'ja-JP': '中貨物輸送', 'de-DE': 'Mittlerer Frachter' },
  'medium freight / gun ship': { 'zh-CN': '中型货运 / 炮艇', 'zh-HK': '中型貨運 / 砲艇', en: 'Medium Freight / Gun Ship', 'ja-JP': '中貨物輸送 / ガンシップ', 'de-DE': 'Mittlerer Frachter / Kanonenschiff' },
  'medium freighter': { 'zh-CN': '中型货船', 'zh-HK': '中型貨船', en: 'Medium Freighter', 'ja-JP': '中型貨物船', 'de-DE': 'Mittlerer Frachter' },
  'medium hauler': { 'zh-CN': '中型运输', 'zh-HK': '中型運輸', en: 'Medium Hauler', 'ja-JP': '中型輸送', 'de-DE': 'Mittlerer Transporter' },
  'medium repair / medium refuel': { 'zh-CN': '中型维修 / 中型补给', 'zh-HK': '中型維修 / 中型補給', en: 'Medium Repair / Medium Refuel', 'ja-JP': '中整備 / 中補給', 'de-DE': 'Mittlere Reparatur / Mittlere Betankung' },
  'medium salvage': { 'zh-CN': '中型回收', 'zh-HK': '中型回收', en: 'Medium Salvage', 'ja-JP': '中型サルベージ', 'de-DE': 'Mittlere Bergung' },
  military: { 'zh-CN': '军用', 'zh-HK': '軍用', en: 'Military', 'ja-JP': '軍用', 'de-DE': 'Militär' },
  'military transport': { 'zh-CN': '军用运输', 'zh-HK': '軍用運輸', en: 'Military Transport', 'ja-JP': '軍用輸送', 'de-DE': 'Militärtransport' },
  minelayer: { 'zh-CN': '布雷', 'zh-HK': '佈雷', en: 'Minelayer', 'ja-JP': '機雷敷設', 'de-DE': 'Minenleger' },
  mining: { 'zh-CN': '采矿', 'zh-HK': '採礦', en: 'Mining', 'ja-JP': '採掘', 'de-DE': 'Bergbau' },
  'mining / refining': { 'zh-CN': '采矿 / 精炼', 'zh-HK': '採礦 / 精煉', en: 'Mining / Refining', 'ja-JP': '採掘 / 精製', 'de-DE': 'Bergbau / Raffinerie' },
  modular: { 'zh-CN': '模块化', 'zh-HK': '模組化', en: 'Modular', 'ja-JP': 'モジュラー', 'de-DE': 'Modular' },
  'modular gunship': { 'zh-CN': '模块化炮艇', 'zh-HK': '模組化砲艇', en: 'Modular Gunship', 'ja-JP': 'モジュラーガンシップ', 'de-DE': 'Modulares Gunship' },
  'multi role / light carrier': { 'zh-CN': '多用途 / 轻型航母', 'zh-HK': '多用途 / 輕型航母', en: 'Multi-Role / Light Carrier', 'ja-JP': '多目的 / 軽空母', 'de-DE': 'Mehrzweck / Leichter Träger' },
  passenger: { 'zh-CN': '客运', 'zh-HK': '客運', en: 'Passenger', 'ja-JP': '旅客輸送', 'de-DE': 'Passagier' },
  pathfinder: { 'zh-CN': '探路', 'zh-HK': '探路', en: 'Pathfinder', 'ja-JP': 'パスファインダー', 'de-DE': 'Pfadfinder' },
  patrol: { 'zh-CN': '巡逻', 'zh-HK': '巡邏', en: 'Patrol', 'ja-JP': '哨戒', 'de-DE': 'Patrouille' },
  'prospecting / mining': { 'zh-CN': '勘探 / 采矿', 'zh-HK': '勘探 / 採礦', en: 'Prospecting / Mining', 'ja-JP': '探鉱 / 採掘', 'de-DE': 'Prospektion / Bergbau' },
  racing: { 'zh-CN': '竞速', 'zh-HK': '競速', en: 'Racing', 'ja-JP': 'レース', 'de-DE': 'Rennen' },
  recon: { 'zh-CN': '侦察', 'zh-HK': '偵察', en: 'Recon', 'ja-JP': '偵察', 'de-DE': 'Aufklärung' },
  'reconnaissance / intelligence': { 'zh-CN': '侦察 / 情报', 'zh-HK': '偵察 / 情報', en: 'Reconnaissance / Intelligence', 'ja-JP': '偵察 / 情報', 'de-DE': 'Aufklärung / Nachrichtendienst' },
  recovery: { 'zh-CN': '回收救援', 'zh-HK': '回收救援', en: 'Recovery', 'ja-JP': '回収', 'de-DE': 'Bergung' },
  refinery: { 'zh-CN': '精炼', 'zh-HK': '精煉', en: 'Refinery', 'ja-JP': '精製', 'de-DE': 'Raffinerie' },
  reporting: { 'zh-CN': '新闻报道', 'zh-HK': '新聞報道', en: 'Reporting', 'ja-JP': '報道', 'de-DE': 'Berichterstattung' },
  salvage: { 'zh-CN': '回收', 'zh-HK': '回收', en: 'Salvage', 'ja-JP': 'サルベージ', 'de-DE': 'Bergung' },
  'snub fighter': { 'zh-CN': '寄生战斗', 'zh-HK': '寄生戰鬥', en: 'Snub Fighter', 'ja-JP': 'スナブ戦闘機', 'de-DE': 'Snub-Jäger' },
  starter: { 'zh-CN': '新手', 'zh-HK': '新手', en: 'Starter', 'ja-JP': 'スターター', 'de-DE': 'Einsteiger' },
  'starter / expedition': { 'zh-CN': '新手 / 远征', 'zh-HK': '新手 / 遠征', en: 'Starter / Expedition', 'ja-JP': 'スターター / 遠征', 'de-DE': 'Einsteiger / Expedition' },
  'starter / light fighter': { 'zh-CN': '新手 / 轻型战斗', 'zh-HK': '新手 / 輕型戰鬥', en: 'Starter / Light Fighter', 'ja-JP': 'スターター / 軽戦闘', 'de-DE': 'Einsteiger / Leichter Jäger' },
  'starter / light freight': { 'zh-CN': '新手 / 轻型货运', 'zh-HK': '新手 / 輕型貨運', en: 'Starter / Light Freight', 'ja-JP': 'スターター / 軽貨物輸送', 'de-DE': 'Einsteiger / Leichter Frachter' },
  'starter / pathfinder': { 'zh-CN': '新手 / 探路', 'zh-HK': '新手 / 探路', en: 'Starter / Pathfinder', 'ja-JP': 'スターター / パスファインダー', 'de-DE': 'Einsteiger / Pfadfinder' },
  'starter / touring': { 'zh-CN': '新手 / 旅行', 'zh-HK': '新手 / 旅行', en: 'Starter / Touring', 'ja-JP': 'スターター / ツーリング', 'de-DE': 'Einsteiger / Touring' },
  stealth: { 'zh-CN': '隐身', 'zh-HK': '隱身', en: 'Stealth', 'ja-JP': 'ステルス', 'de-DE': 'Tarnung' },
  'stealth bomber': { 'zh-CN': '隐身轰炸', 'zh-HK': '隱身轟炸', en: 'Stealth Bomber', 'ja-JP': 'ステルス爆撃', 'de-DE': 'Tarnbomber' },
  'stealth fighter': { 'zh-CN': '隐身战斗', 'zh-HK': '隱身戰鬥', en: 'Stealth Fighter', 'ja-JP': 'ステルス戦闘', 'de-DE': 'Tarnjäger' },
  touring: { 'zh-CN': '旅行', 'zh-HK': '旅行', en: 'Touring', 'ja-JP': 'ツーリング', 'de-DE': 'Touring' },
  transport: { 'zh-CN': '运输', 'zh-HK': '運輸', en: 'Transport', 'ja-JP': '輸送', 'de-DE': 'Transport' },
  transporter: { 'zh-CN': '运输', 'zh-HK': '運輸', en: 'Transporter', 'ja-JP': '輸送', 'de-DE': 'Transporter' },
};

const SHIP_METADATA_TRANSLATIONS: Record<ShipMetadataGroup, ShipMetadataTranslationMap> = {
  type: SHIP_TYPE_TRANSLATIONS,
  size: SHIP_SIZE_TRANSLATIONS,
  status: SHIP_STATUS_TRANSLATIONS,
  focus: SHIP_FOCUS_TRANSLATIONS,
};

const SHIP_METADATA_ALIASES: ShipMetadataAliasMap = {
  type: {
    'multi purpose': 'multi',
  },
  size: {},
  status: {
    'in concept': 'concept',
    ready: 'flight ready',
  },
  focus: {
    'anti air': 'anti aircraft',
    'heavy gunship': 'heavy gun ship',
  },
};

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fallbackShipMetadataLabel(value?: string | null) {
  if (!value) return '';

  return value
    .trim()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' / ')
    .map((segment) => segment.split(' ').filter(Boolean).map(capitalizeWord).join(' '))
    .join(' / ');
}

export function normalizeShipMetadataLocale(locale?: string | null): ShipMetadataLocale {
  if (!locale) {
    return 'en';
  }

  const normalized = locale.trim();
  if (normalized.startsWith('zh-TW') || normalized.startsWith('zh-HK') || normalized.startsWith('zh-MO') || normalized.includes('Hant')) {
    return 'zh-HK';
  }
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('ja')) {
    return 'ja-JP';
  }
  if (normalized.startsWith('de')) {
    return 'de-DE';
  }
  return 'en';
}

export function normalizeShipMetadataKey(value?: string | null) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '';
}

function getCanonicalShipMetadataKey(group: ShipMetadataGroup, value?: string | null) {
  const normalizedKey = normalizeShipMetadataKey(value);
  return SHIP_METADATA_ALIASES[group][normalizedKey] || normalizedKey;
}

export function getShipMetadataEntry(group: ShipMetadataGroup, value?: string | null): ShipMetadataEntry {
  const rawValue = value?.trim() || '';
  const normalizedKey = normalizeShipMetadataKey(value);
  const canonicalKey = getCanonicalShipMetadataKey(group, value);

  return {
    rawValue,
    normalizedKey,
    canonicalKey,
    translations: canonicalKey ? SHIP_METADATA_TRANSLATIONS[group][canonicalKey] : undefined,
  };
}

export function localizeShipMetadataValue(
  locale: string,
  value: string | null | undefined,
  group: ShipMetadataGroup,
) {
  if (!value) return '';

  const resolvedLocale = normalizeShipMetadataLocale(locale);
  const entry = getShipMetadataEntry(group, value);
  return entry.translations?.[resolvedLocale] || entry.translations?.en || fallbackShipMetadataLabel(value);
}

export function localizeShipType(locale: string, value?: string | null) {
  return localizeShipMetadataValue(locale, value, 'type');
}

export function localizeShipSize(locale: string, value?: string | null) {
  return localizeShipMetadataValue(locale, value, 'size');
}

export function localizeShipFocus(locale: string, value?: string | null) {
  return localizeShipMetadataValue(locale, value, 'focus');
}

export function localizeShipStatusValue(locale: string, value?: string | null) {
  return localizeShipMetadataValue(locale, value, 'status');
}

export function localizeShipStatus(locale: string, ship?: Ship | null) {
  return localizeShipStatusValue(locale, ship?.flyableStatus || ship?.details?.productionStatus);
}
