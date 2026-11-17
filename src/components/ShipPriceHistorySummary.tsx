import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import { CircularProgress, useMediaQuery } from '@mui/material';
import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, type ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { usePriceHistoryData } from '@/hooks';
import { buildShipPricePeriods, latestShipPrices, type PriceGroup } from '@/utils/shipPriceHistory';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip);
const colors: Record<PriceGroup,string> = {standard:'#3b67d9',warbond:'#e05260'};

/** Compact companion to the complete price-history page; data remains SKU-resolved. */
export default function ShipPriceHistorySummary({shipId,shipName}: {shipId:number;shipName:string}) {
  const intl=useIntl();
  const mobile=useMediaQuery('(max-width: 644px)');
  const {priceHistoryMap,loading,error}=usePriceHistoryData();
  const [dark,setDark]=useState(()=>document.documentElement.classList.contains('dark'));
  const [now]=useState(()=>Date.now());
  useEffect(()=>{
    const observer=new MutationObserver(()=>setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    return ()=>observer.disconnect();
  },[]);
  const history=priceHistoryMap[shipId]?.history;
  const start=now-365*24*60*60*1000;
  const periods=useMemo(()=>buildShipPricePeriods(history||[],shipName,start,now),[history,shipName,start,now]);
  const latest=useMemo(()=>latestShipPrices(history||[],shipName,now),[history,shipName,now]);
  const t=(key:string)=>{ const id=`shipPriceHistory.${key}`; return intl.formatMessage({id}); };
  const label=(group:PriceGroup)=>group==='standard'?t('standard'):'Warbond';
  const money=(price:number)=>intl.formatNumber(price,{style:'currency',currency:'USD',currencyDisplay:'symbol'});
  const slug=shipName.toLowerCase().trim().replace(/[^\w\s-]/g,'').replace(/[\s_-]+/g,'-').replace(/^-+|-+$/g,'');
  const data={datasets:periods.map(period=>({
    label:label(period.group),
    data:[{x:period.start,y:period.price},{x:period.end,y:period.price}],
    borderColor:colors[period.group],backgroundColor:colors[period.group],borderWidth:3,
    pointRadius:period.end-period.start<86400000?1.5:0,pointHoverRadius:4,pointHitRadius:8,
  }))};
  const options:ChartOptions<'line'>={
    responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
    interaction:{mode:'nearest',intersect:false},
    plugins:{legend:{display:false},tooltip:{
      callbacks:{title:items=>items[0]?.parsed.x!=null?intl.formatDate(items[0].parsed.x,{year:'numeric',month:'short',day:'numeric'}):'',
        label:item=>`${item.dataset.label} · ${money(item.parsed.y ?? 0)}`},
    }},
    scales:{
      x:{type:'linear',min:start,max:now,grid:{display:false},border:{display:false},
        ticks:{color:dark?'#94a3b8':'#64748b',count:mobile?3:5,autoSkip:false,maxTicksLimit:mobile?3:5,maxRotation:0,font:{size:11},callback:value=>intl.formatDate(Number(value),{year:'2-digit',month:'2-digit'})}},
      y:{grid:{color:dark?'#334155':'#edf0f3'},border:{display:false},
        ticks:{color:dark?'#94a3b8':'#64748b',maxTicksLimit:4,font:{size:11},callback:value=>intl.formatNumber(Number(value),{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:Number.isInteger(Number(value))?0:2})}},
    },
  };
  return <section className="flex min-w-0 flex-col gap-2" aria-label={t('title')}>
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t('title')}</h3>
      <Link to={slug?`/price-history/${slug}`:'/price-history'} className="text-[13px] text-[#1976d2] hover:underline dark:text-blue-400">{t('fullHistory')}</Link>
    </div>
    <div className="flex min-w-0 flex-col gap-3 rounded border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1 text-xs"><span style={{color:colors.standard}}>{label('standard')}</span><span style={{color:colors.warbond}}>Warbond</span><span className="text-slate-500 dark:text-slate-400">{t('pastYear')}</span></div>
      {loading?<div className="flex h-[180px] items-center justify-center gap-2 text-sm text-slate-500"><CircularProgress size={18}/>{t('loading')}</div>:
        error?<p className="py-4 text-sm text-slate-500 dark:text-slate-400">{t('error')}</p>:
        periods.length?<div className="h-[180px] min-w-0"><Line data={data} options={options} role="img" aria-label={intl.formatMessage({id:'shipPriceHistory.chartLabel'},{ship:shipName})}/></div>:
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400">{t('empty')}</p>}
      {!loading&&!error&&latest&&<div className="flex flex-col sm:flex-row sm:flex-wrap items-start gap-x-5 gap-y-2 sm:gap-y-1 text-[13px]">
        <span className="text-slate-500 dark:text-slate-400">{t('latest')} {intl.formatDate(latest.ts,{year:'numeric',month:'2-digit',day:'2-digit'})}</span>
        {latest.prices.map(item=><span key={`${item.group}:${item.price}`} className="text-slate-700 dark:text-slate-200">{label(item.group)} · {money(item.price)}</span>)}
      </div>}
    </div>
  </section>;
}
