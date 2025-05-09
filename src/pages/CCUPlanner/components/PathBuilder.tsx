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
  onCreatePath: (stepShips: Ship[][]) => void;
}

export default function PathBuilder({ open, onClose, ships, ccus, wbHistory, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  // const [selectedShips, setSelectedShips] = useState<Ship[]>([]);
  const [stepShips, setLayerShips] = useState<Ship[][]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [filteredShips, setFilteredShips] = useState<Ship[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open) {
      // setSelectedShips([]);
      setLayerShips([]);
      setCurrentStep(0);
      setSearchTerm('');
    }
  }, [open]);

  const getCurrentLayerValue = useCallback(() => {
    if (currentStep > 0 && stepShips[currentStep - 1] && stepShips[currentStep - 1].length > 0) {
      return stepShips[currentStep - 1][0].msrp;
    }
    return 0;
  }, [currentStep, stepShips]);

  useEffect(() => {
    let filtered = ships.filter(ship => ship.msrp > 0);

    if (searchTerm) {
      filtered = filtered.filter(ship =>
        ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (currentStep === 1) {
      const prevStepMsrpMin = stepShips[currentStep - 1].reduce((min, ship) => Math.min(min, ship.msrp), Infinity);
      filtered = filtered.filter(ship => {
        if (stepShips[currentStep - 1].find(s => s.id === ship.id)) {
          return false;
        }
        return ship.msrp > prevStepMsrpMin
      })
    }

    filtered = [...filtered].sort((a, b) => a.msrp - b.msrp);

    setFilteredShips(filtered);
  }, [ships, currentStep, stepShips, searchTerm, getCurrentLayerValue]);

  const updateSelectedPath = () => {
    const newSelectedShips: Ship[] = [];
    stepShips.forEach(layer => {
      if (layer && layer.length > 0) {
        newSelectedShips.push(layer[0]);
      }
    });
    // setSelectedShips(newSelectedShips);
  };

  const nextStep = () => {
    if (stepShips[currentStep] && stepShips[currentStep].length > 0) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreatePath = () => {
    onCreatePath(stepShips);
    onClose();
  };

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

  // 移除船只的所有版本
  const removeAllShipVersions = (shipId: number, shipName: string) => {
    setLayerShips(prev => {
      const newLayerShips = [...prev];
      if (newLayerShips[currentStep]) {
        newLayerShips[currentStep] = newLayerShips[currentStep].filter(s => 
          !(s.id === shipId || s.name === `${shipName}-wb` || s.name === `${shipName}-historical`)
        );
        
        // 如果此层没有船只了，清除此层
        if (newLayerShips[currentStep].length === 0) {
          newLayerShips.splice(currentStep);
        }
      }
      return newLayerShips;
    });
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
            <div className="text-lg font-medium text-center">
              {
                currentStep === 0 ? (
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
            </div>
          </div>

          <div className="p-4 border-b border-gray-200">
            <input
              type="text"
              placeholder={intl.formatMessage({ id: 'pathBuilder.searchPlaceholder', defaultMessage: 'Search ship...' })}
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

                const isSelected = stepShips[currentStep]?.some(s => 
                  s.id === ship.id && 
                  s.name === ship.name
                );
                const isWbSelected = stepShips[currentStep]?.some(s => s.name === `${ship.name}-wb`);
                const isHistoricalSelected = stepShips[currentStep]?.some(s => s.name === `${ship.name}-historical`);

                return <div key={ship.id} className="flex items-center justify-between">
                  <div
                    onClick={() => {
                      if (isSelected) {
                        // 如果已选择普通版本，则取消选择
                        const shipIndex = stepShips[currentStep]?.findIndex(s => 
                          s.id === ship.id && s.name === ship.name
                        ) || 0;
                        removeShipFromLayer(currentStep, shipIndex);
                      } else {
                        // 如果选择普通版本，先移除所有版本，再添加普通版本
                        removeAllShipVersions(ship.id, ship.name);
                        setLayerShips(prev => {
                          const newLayerShips = [...prev];
                          newLayerShips[currentStep] = [...(prev[currentStep] || []), ship];
                          return newLayerShips;
                        });
                      }
                    }}
                    className={`p-2 h-fit cursor-pointer hover:bg-amber-100 dark:hover:bg-gray-900 w-full ${isSelected ? 'bg-amber-100 dark:bg-gray-900' : ''}`}
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
                    currentStep === 1 && (<>
                      {
                        wb && <div
                          className={`flex flex-col items-center justify-center px-2 ml-2 h-full hover:bg-amber-100 dark:hover:bg-gray-900 cursor-pointer ${isWbSelected ? 'bg-amber-100 dark:bg-gray-900' : ''}`}
                          onClick={() => {
                            if (isWbSelected) {
                              // 如果已选择Warbound版本，则取消选择
                              removeShipFromLayer(currentStep, stepShips[currentStep]?.findIndex(s => s.name === `${ship.name}-wb`) || 0);
                            } else {
                              // 若选择Warbound版本，先移除所有版本，再添加Warbound版本
                              removeAllShipVersions(ship.id, ship.name);
                              const wbShip = {
                                ...ship,
                                name: `${ship.name}-wb`,
                              };
                              setLayerShips(prev => {
                                const newLayerShips = [...prev];
                                newLayerShips[currentStep] = [...(prev[currentStep] || []), wbShip];
                                return newLayerShips;
                              });
                            }
                          }}>
                          <div className="text-lg text-blue-400 font-bold text-center">
                            {(wb.price / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </div>
                          <div className="text-xs text-gray-400 text-center">
                            <FormattedMessage id="pathBuilder.warbound" defaultMessage="Warbound" />
                          </div>
                        </div>
                      }
                      {
                        historical && <div
                          className={`flex flex-col items-center justify-center px-2 ml-2 h-full hover:bg-amber-100 dark:hover:bg-gray-900 cursor-pointer ${isHistoricalSelected ? 'bg-amber-100 dark:bg-gray-900' : ''}`}
                          onClick={() => {
                            if (isHistoricalSelected) {
                              // 如果已选择Historical版本，则取消选择
                              removeShipFromLayer(currentStep, stepShips[currentStep]?.findIndex(s => s.name === `${ship.name}-historical`) || 0);
                            } else {
                              // 若选择Historical版本，先移除所有版本，再添加Historical版本
                              removeAllShipVersions(ship.id, ship.name);
                              const historicalShip = {
                                ...ship,
                                name: `${ship.name}-historical`,
                              };
                              setLayerShips(prev => {
                                const newLayerShips = [...prev];
                                newLayerShips[currentStep] = [...(prev[currentStep] || []), historicalShip];
                                return newLayerShips;
                              });
                            }
                          }}
                        >
                          <div className="text-lg text-blue-400 font-bold text-center">
                            {parseFloat(historical.price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </div>
                          <div className="text-xs text-gray-400 text-center">
                            <FormattedMessage id="pathBuilder.historicalWb" defaultMessage="Historical" />
                          </div>
                        </div>
                      }
                    </>)
                  }
                </div>
              })}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="border-t border-gray-200 p-4 flex justify-end gap-2">
            <Button onClick={() => {
              if (currentStep === 0) {
                onClose();
              } else {
                prevStep();
              }
            }} variant="outlined">
              {
                currentStep === 0 ? (
                  <FormattedMessage id="pathBuilder.cancel" defaultMessage="Cancel" />
                ) : (
                  <FormattedMessage id="pathBuilder.prevStep" defaultMessage="Prev Step" />
                )
              }
            </Button>
            {
              currentStep === 0 ? (
                <Button
                  onClick={nextStep}
                  variant="contained"
                  disabled={!(stepShips[currentStep]?.length > 0)}
                  color="primary"
                >
                  <FormattedMessage id="pathBuilder.nextStep" defaultMessage="Next Step" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreatePath}
                  variant="contained"
                  disabled={!(stepShips[currentStep]?.length > 0)}
                  color="primary"
                >
                  <FormattedMessage id="pathBuilder.createPath" defaultMessage="创建路径" />
                </Button>
              )
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
