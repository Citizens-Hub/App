import { LoaderCircle } from 'lucide-react'
import useResourceData from './hooks/useResourceData'
import CcuCanvas from './components/CcuCanvas'
import NewsModal from './components/NewsModal'
import { useEffect } from 'react'
import { FormattedMessage } from 'react-intl'
import { useLocation } from 'react-router'

export default function CCUPlanner() {
  const { ships, ccus, wbHistory, loading, showNewsModal, closeNewsModal } = useResourceData()
  const pathname = useLocation().pathname

  useEffect(() => {
    if (pathname !== '/ccu-planner') {
      window.location.href = '/ccu-planner'
    }
  }, [pathname])
  
  if (loading) return (
    <div>
      <h1 className="flex items-center gap-4">
        <LoaderCircle className="w-8 h-8 animate-spin" />
        <FormattedMessage id="ccuPlanner.loading" defaultMessage="Loading CCU Planner..." />
      </h1>
    </div>
  )

  return (
    <div className="h-[calc(100vh-65px)] w-[calc(100vw-4px)] md:w-full flex flex-col absolute top-[65px] left-0">
      {/* <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-2xl font-bold">
          <FormattedMessage id="ccuPlanner.heading" defaultMessage="Ship Upgrade Planner" />
        </h1>
        <p className="text-gray-400">
          <FormattedMessage id="ccuPlanner.description" defaultMessage="Create your CCU path" />
        </p>
      </div> */}
      
      <div className="flex-1 relative w-full h-full">
        <CcuCanvas ships={ships} ccus={ccus} wbHistory={wbHistory} />
      </div>

      <NewsModal open={showNewsModal} onClose={closeNewsModal} />
    </div>
  )
}
