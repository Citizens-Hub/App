import { LoaderCircle } from 'lucide-react'
import useResourceData from './hooks/useResourceData'
import CcuCanvas from './components/CcuCanvas'

export default function CCUPlanner() {
  const { ships, loading } = useResourceData()
  
  if (loading) return (
    <div>
      <h1 className="flex items-center gap-4">
        <LoaderCircle className="w-8 h-8 animate-spin" />
        Loading CCU Planner...
      </h1>
    </div>
  )

  return (
    <div className="h-full w-[100vw] flex flex-col absolute top-0 left-0">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold">舰船升级规划工具</h1>
        <p className="text-gray-400">创建您的星际公民船舶升级路径</p>
      </div>
      
      <div className="flex-1 relative">
        <CcuCanvas ships={ships} />
      </div>
    </div>
  )
}