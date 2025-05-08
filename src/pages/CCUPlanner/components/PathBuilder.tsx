import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import { Ccu, Ship, WbHistoryData } from '../../../types';

interface PathBuilderProps {
  open: boolean;
  onClose: () => void;
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  onCreatePath: (path: Ship[]) => void;
}

export default function PathBuilder({ open, onClose, ships, ccus, wbHistory, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  const [selectedShips, setSelectedShips] = useState<Ship[]>([]);
  // 每一层选择的船只
  const [layerShips, setLayerShips] = useState<Ship[][]>([]);
  const [currentLayer, setCurrentLayer] = useState<number>(0);
  const [filteredShips, setFilteredShips] = useState<Ship[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // 重置状态
  useEffect(() => {
    if (open) {
      setSelectedShips([]);
      setLayerShips([]);
      setCurrentLayer(0);
      setSearchTerm('');
    }
  }, [open]);

  // 获取当前层的价值
  const getCurrentLayerValue = useCallback(() => {
    if (currentLayer > 0 && layerShips[currentLayer - 1] && layerShips[currentLayer - 1].length > 0) {
      return layerShips[currentLayer - 1][0].msrp;
    }
    return 0;
  }, [currentLayer, layerShips]);

  // 根据当前层和搜索词筛选舰船
  useEffect(() => {
    let filtered = ships;

    // // 如果当前层已经有选择的船只（包括第一层）
    // if (layerShips[currentLayer] && layerShips[currentLayer].length > 0) {
    //   // 显示与当前层第一艘船价值相当的船只
    //   const currentLayerValue = layerShips[currentLayer][0].msrp;
    //   filtered = ships.filter(ship => Math.abs(ship.msrp - currentLayerValue) < 10);
    // }
    // // 如果是非第一层且尚未选择船只
    // else if (currentLayer > 0) {
    //   const prevLayerValue = getCurrentLayerValue();
    //   // 未选择船只时，显示价值大于上一层的船只
    //   filtered = ships.filter(ship => ship.msrp > prevLayerValue);
    // }

    // 根据搜索词筛选
    if (searchTerm) {
      filtered = filtered.filter(ship =>
        ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 按价格排序
    filtered = [...filtered].sort((a, b) => a.msrp - b.msrp);

    setFilteredShips(filtered);
  }, [ships, currentLayer, layerShips, searchTerm, getCurrentLayerValue]);

  // 更新选择路径
  const updateSelectedPath = () => {
    const newSelectedShips: Ship[] = [];
    layerShips.forEach(layer => {
      if (layer && layer.length > 0) {
        newSelectedShips.push(layer[0]);
      }
    });
    setSelectedShips(newSelectedShips);
  };

  // 移至下一层
  const nextLayer = () => {
    if (layerShips[currentLayer] && layerShips[currentLayer].length > 0) {
      setCurrentLayer(currentLayer + 1);
    }
  };

  // 移至上一层
  const prevLayer = () => {
    if (currentLayer > 0) {
      setCurrentLayer(currentLayer - 1);
    }
  };

  // 创建路径
  const handleCreatePath = () => {
    if (selectedShips.length >= 2) {
      onCreatePath(selectedShips);
      onClose();
    }
  };

  // // 获取当前层显示的价值
  // const getDisplayLayerValue = () => {
  //   if (layerShips[currentLayer] && layerShips[currentLayer].length > 0) {
  //     return layerShips[currentLayer][0].msrp;
  //   }
  //   return 0;
  // };

  // 从路径中删除船只
  const removeShipFromLayer = (layerIndex: number, shipIndex: number) => {
    setLayerShips(prev => {
      const newLayerShips = [...prev];
      if (newLayerShips[layerIndex]) {
        newLayerShips[layerIndex] = [
          ...newLayerShips[layerIndex].slice(0, shipIndex),
          ...newLayerShips[layerIndex].slice(shipIndex + 1)
        ];

        // 如果此层没有船只了，清除此层及后续层级
        if (newLayerShips[layerIndex].length === 0) {
          newLayerShips.splice(layerIndex);
        }
      }
      return newLayerShips;
    });
    updateSelectedPath();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        paperProps: {
          sx: {
            maxHeight: '80vh',
          }
        }
      }}
    >
      <DialogTitle className="flex justify-between items-center border-b border-gray-200">
        <div>
          <FormattedMessage id="pathBuilder.title" defaultMessage="Path Builder" />
        </div>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent className="p-0">
        <div className="flex flex-col">
          <div className="border-b border-gray-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4 justify-between w-full">
              <Button
                variant="outlined"
                onClick={prevLayer}
                disabled={currentLayer === 0}
              >
                <FormattedMessage id="pathBuilder.prevLayer" defaultMessage="Prev" />
              </Button>

              <div className="text-lg font-medium">
                {
                  currentLayer === 0 ? (
                    <FormattedMessage
                      id="pathBuilder.step1"
                      defaultMessage="Step 1: Select your starting ships"
                    />
                  ) : (
                    <FormattedMessage
                      id="pathBuilder.step2"
                      defaultMessage="Step 2: Select all ships that need to be included to the path"
                    />
                  )
                }
                {/* <FormattedMessage 
                  id="pathBuilder.layerInfo" 
                  defaultMessage="Level: {currentLayer}, Value: {value}"
                  values={{ 
                    currentLayer: currentLayer + 1, 
                    value: getDisplayLayerValue() > 0 ? (getDisplayLayerValue() / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '-' 
                  }}
                /> */}
              </div>

              <Button
                variant="outlined"
                onClick={nextLayer}
                disabled={!layerShips[currentLayer] || layerShips[currentLayer].length === 0}
              >
                <FormattedMessage id="pathBuilder.nextLayer" defaultMessage="Next" />
              </Button>
            </div>
          </div>

          {/* <div className="border-b border-gray-200 p-4">
            <h3 className="mb-2 font-medium">
              <FormattedMessage id="pathBuilder.selectedShips" defaultMessage="Selected Ships" />
            </h3>
            <div className="flex flex-wrap gap-4 items-center">
              {layerShips[currentLayer]?.length === 0 ? (
                <div className="text-gray-500">
                  <FormattedMessage id="pathBuilder.noSelection" defaultMessage="No selection" />
                </div>
              ) : (
                layerShips[currentLayer]?.map((ship, index) => (
                  <div
                    key={`layer-${index}`}
                    className={`border rounded-md p-3 ${currentLayer === index ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : ''}`}
                    onClick={() => setCurrentLayer(index)}
                  >
                    <div key={ship.id}>
                      <img src={ship.medias.productThumbMediumAndSmall} alt={ship.name} className="w-16 h-16 object-cover mr-2" />
                      <div>
                        <h3 className="font-medium">{ship.name}</h3>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div> */}

          <div className="p-4 border-b border-gray-200">
            <input
              type="text"
              placeholder={intl.formatMessage({ id: 'pathBuilder.searchPlaceholder', defaultMessage: '搜索舰船...' })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-500 rounded-md px-3 py-2 w-full"
            />
          </div>

          <div className="flex-1">
            <div className="h-[calc(100vh-600px)] overflow-auto flex flex-col justify-start">
              {filteredShips.map((ship) => {
                const skus = ccus.find(c => c.id === ship.id)?.skus
                const wb = skus?.find(sku => sku.price !== ship.msrp)
                const historical = wbHistory?.find(wb => wb.name.trim().toUpperCase() === ship.name.trim().toUpperCase() && wb.price !== '')

                return <div key={ship.id} className="flex items-center justify-between">
                  <div
                    onClick={() => {
                      if (layerShips[currentLayer]?.includes(ship)) {
                        removeShipFromLayer(currentLayer, layerShips[currentLayer]?.indexOf(ship) || 0)
                      } else {
                        setLayerShips(prev => {
                          const newLayerShips = [...prev];
                          newLayerShips[currentLayer] = [...(prev[currentLayer] || []), ship];
                          return newLayerShips;
                        });
                      }
                    }}
                    className={`p-2 h-fit cursor-pointer hover:bg-amber-100 dark:hover:bg-gray-900 w-full ${layerShips[currentLayer]?.includes(ship) ? 'bg-amber-100 dark:bg-gray-900' : ''}`}
                  >
                    <div className="flex items-center text-left">
                      <img
                        src={ship.medias.productThumbMediumAndSmall}
                        alt={ship.name}
                        className="w-16 h-16 object-cover mr-2"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{ship.name}</h3>
                          {ship.flyableStatus !== 'Flyable' && (
                            <div className="text-xs text-white bg-sky-400 rounded-sm px-1">{ship.flyableStatus}</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{ship.manufacturer.name}</div>
                        <div className="text-sm text-blue-400 font-bold">
                          {(ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </div>
                      </div>
                    </div>
                  </div>
                  {
                    wb && <div className="flex flex-col items-center justify-center px-2 mx-2 h-full hover:bg-amber-100 dark:hover:bg-gray-900 cursor-pointer">
                      <div className="text-lg text-blue-400 font-bold text-center">
                        {(wb.price / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </div>
                      <div className="text-xs text-gray-400 text-center">
                        <FormattedMessage id="pathBuilder.warbound" defaultMessage="Warbound" />
                      </div>
                    </div>
                  }
                  {
                    historical && <div className="flex flex-col items-center justify-center px-2 mx-2 h-full hover:bg-amber-100 dark:hover:bg-gray-900 cursor-pointer">
                      <div className="text-lg text-blue-400 font-bold text-center">
                        {Number(historical.price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </div>
                      <div className="text-xs text-gray-400 text-center">
                        <FormattedMessage id="pathBuilder.historicalWb" defaultMessage="Historical" />
                      </div>
                    </div>
                  }
                </div>
              })}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="border-t border-gray-200 p-4 flex justify-end gap-2">
            <Button onClick={onClose} variant="outlined">
              <FormattedMessage id="pathBuilder.cancel" defaultMessage="取消" />
            </Button>
            <Button
              onClick={handleCreatePath}
              variant="contained"
              disabled={selectedShips.length < 2}
              color="primary"
            >
              <FormattedMessage id="pathBuilder.createPath" defaultMessage="创建路径" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
