import { LoaderCircle } from 'lucide-react'
import useResourceData from './hooks/useResourceData'
import CcuCanvas from './components/CcuCanvas'
import NewsModal from './components/NewsModal'
import { FormattedMessage, useIntl } from 'react-intl'
import { Helmet } from 'react-helmet'

export default function CCUPlanner() {
  const { ships, ccus, wbHistory, exchangeRates, loading, showNewsModal, closeNewsModal } = useResourceData()
  const intl = useIntl()
  
  if (loading) return (
    <div>
      <Helmet>
        <meta name="description" content={intl.formatMessage({ id: "ccuPlanner.seoDescription", defaultMessage: "星际公民(Star Citizen)CCU升级规划工具 - 帮助您规划和优化舰船升级路径" })} />
        <meta name="keywords" content="Star Citizen, CCU, 星际公民, 舰船升级, 规划工具" />
        <link rel="canonical" href="https://citizenshub.app/ccu-planner" />
        <meta property="og:title" content={intl.formatMessage({ id: "ccuPlanner.seoTitle", defaultMessage: "CCU规划工具 - Citizens' Hub" })} />
        <meta property="og:description" content={intl.formatMessage({ id: "ccuPlanner.seoDescription", defaultMessage: "星际公民(Star Citizen)CCU升级规划工具 - 帮助您规划和优化舰船升级路径" })} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://citizenshub.app/ccu-planner" />
      </Helmet>
      <h1 className="flex items-center gap-4">
        <LoaderCircle className="w-8 h-8 animate-spin" />
        <FormattedMessage id="ccuPlanner.loading" defaultMessage="Loading CCU Planner..." />
      </h1>
    </div>
  )

  return (
    <div className="h-[calc(100vh-65px)] w-[calc(100vw-4px)] md:w-full flex flex-col absolute top-[65px] left-0">
      <Helmet>
        <meta name="description" content={intl.formatMessage({ id: "ccuPlanner.seoDescription", defaultMessage: "星际公民(Star Citizen)CCU升级规划工具 - 帮助您规划和优化舰船升级路径" })} />
        <meta name="keywords" content="Star Citizen, CCU, 星际公民, 舰船升级, 规划工具" />
        <link rel="canonical" href="https://citizenshub.app/ccu-planner" />
        <meta property="og:title" content={intl.formatMessage({ id: "ccuPlanner.seoTitle", defaultMessage: "CCU规划工具 - Citizens' Hub" })} />
        <meta property="og:description" content={intl.formatMessage({ id: "ccuPlanner.seoDescription", defaultMessage: "星际公民(Star Citizen)CCU升级规划工具 - 帮助您规划和优化舰船升级路径" })} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://citizenshub.app/ccu-planner" />

        {/* 结构化数据 */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "CCU规划工具 - Citizens' Hub",
            "description": "星际公民(Star Citizen)CCU升级规划工具 - 帮助您规划和优化舰船升级路径",
            "applicationCategory": "UtilityApplication",
            "operatingSystem": "Any",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD",
              "availability": "https://schema.org/InStock"
            }
          })}
        </script>
      </Helmet>

      <div className="flex-1 relative w-full h-full">
        <CcuCanvas ships={ships} ccus={ccus} exchangeRates={exchangeRates} wbHistory={wbHistory} />
      </div>

      <NewsModal open={showNewsModal} onClose={closeNewsModal} />
    </div>
  )
}
