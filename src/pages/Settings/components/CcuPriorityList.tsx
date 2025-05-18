import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { CcuSourceType } from '../../../types';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../store';
import { setCcuSourceTypePriority } from '../../../store/upgradesStore';
import { MoreHorizontal } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// CCU类型显示样式和颜色
const ccuTypeStyles = {
  [CcuSourceType.OFFICIAL]: {
    bgColor: 'bg-blue-700',
    borderColor: 'border-blue-500',
  },
  [CcuSourceType.AVAILABLE_WB]: {
    bgColor: 'bg-orange-400',
    borderColor: 'border-orange-400',
  },
  [CcuSourceType.OFFICIAL_WB]: {
    bgColor: 'bg-red-600',
    borderColor: 'border-red-500',
  },
  [CcuSourceType.THIRD_PARTY]: {
    bgColor: 'bg-purple-700',
    borderColor: 'border-purple-500',
  },
  [CcuSourceType.HANGER]: {
    bgColor: 'bg-cyan-500',
    borderColor: 'border-cyan-300',
  },
  [CcuSourceType.HISTORICAL]: {
    bgColor: 'bg-gray-500',
    borderColor: 'border-gray-500',
  },
};

// 可排序的项目组件
function SortableItem({ id, type }: { id: string, type: CcuSourceType }) {
  const intl = useIntl();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 获取CCU类型名称
  const getCcuTypeName = (type: CcuSourceType) => {
    switch (type) {
      case CcuSourceType.OFFICIAL:
        return intl.formatMessage({ id: "shipNode.official", defaultMessage: "Official" });
      case CcuSourceType.AVAILABLE_WB:
        return intl.formatMessage({ id: "shipNode.availableWB", defaultMessage: "WB" });
      case CcuSourceType.OFFICIAL_WB:
        return intl.formatMessage({ id: "shipNode.manualOfficialWB", defaultMessage: "Manual: Official WB CCU" });
      case CcuSourceType.THIRD_PARTY:
        return intl.formatMessage({ id: "shipNode.manualThirdParty", defaultMessage: "Manual: Third Party CCU" });
      case CcuSourceType.HANGER:
        return intl.formatMessage({ id: "shipNode.hangar", defaultMessage: "Hangar" });
      case CcuSourceType.HISTORICAL:
        return intl.formatMessage({ id: "shipNode.historical", defaultMessage: "Historical" });
      default:
        return type;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center justify-between border rounded p-3 border-gray-200 dark:border-gray-700 bg-opacity-10 dark:bg-opacity-20 cursor-grab bg-white dark:bg-gray-800"
    >
      <div className="flex items-center gap-3">
        <div className={`w-4 h-4 rounded-full ${ccuTypeStyles[type].bgColor}`}></div>
        <span>{getCcuTypeName(type)}</span>
      </div>
      <MoreHorizontal size={16} className="text-gray-500" />
    </div>
  );
}

export default function CcuPriorityList() {
  const dispatch = useDispatch();
  const priorities = useSelector((state: RootState) => state.upgrades.ccuSourceTypePriority);
  
  // 创建一个本地副本以处理拖拽顺序变化
  const [items, setItems] = useState<CcuSourceType[]>(priorities);

  // 配置传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 处理拖拽结束事件
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex(item => item === active.id);
        const newIndex = items.findIndex(item => item === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // 保存到Redux
        dispatch(setCcuSourceTypePriority(newItems));
        
        return newItems;
      });
    }
  };

  return (
    <div className="w-full mb-4">
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        <FormattedMessage 
          id="settings.ccuPriorityDragHint" 
          defaultMessage="Drag items to change the priority of CCU types. Types with higher priority will be considered first for upgrade paths." 
        />
      </p>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={items} 
          strategy={verticalListSortingStrategy}
        >
          <div className="w-full flex flex-col gap-2">
            {items.map((type) => (
              <SortableItem key={type} id={type} type={type} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
} 