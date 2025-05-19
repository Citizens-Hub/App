import { LoaderCircle } from 'lucide-react'
import useCcuPlannerData from './hooks/useCcuPlannerData'
import CcuCanvas from './components/CcuCanvas'
import { FormattedMessage } from 'react-intl'
import NewsModal from './components/NewsModal'

export default function CCUPlanner() {
  const { ships, ccus, wbHistory, exchangeRates, loading, showNewsModal, closeNewsModal } = useCcuPlannerData()
  
  if (loading) return (
    <div>
      <h1 className="flex items-center gap-4 px-8">
        <LoaderCircle className="w-8 h-8 animate-spin" />
        <FormattedMessage id="ccuPlanner.loading" defaultMessage="Loading CCU Planner..." />
      </h1>
    </div>
  )

  return (
    <div className="h-[calc(100vh-65px)] w-[calc(100vw-4px)] md:w-full flex flex-col absolute top-[65px] left-0">
      <div className="flex-1 relative w-full h-full">
        {/* TODO: use a store to pass the data */}
        <CcuCanvas ships={ships} ccus={ccus} exchangeRates={exchangeRates} wbHistory={wbHistory} />
      </div>

      <NewsModal open={showNewsModal} onClose={closeNewsModal} />
    </div>
  )
}
