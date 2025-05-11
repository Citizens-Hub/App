import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import { Ccu, Ship, WbHistoryData, HangarItem } from '../../../types';

interface PathBuilderProps {
  open: boolean;
  onClose: () => void;
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  onCreatePath: (stepShips: Ship[][]) => void;
}

export default function PathBuilder({ open, onClose, ships, ccus, wbHistory, hangarItems, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  // const [selectedShips, setSelectedShips] = useState<Ship[]>([]);
  const [stepShips, setLayerShips] = useState<Ship[][]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [filteredShips, setFilteredShips] = useState<Ship[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCcus, setSelectedCcus] = useState<HangarItem[]>([]);
  const [filteredCcus, setFilteredCcus] = useState<HangarItem[]>([]);
  const [ccuSearchTerm, setCcuSearchTerm] = useState('');

  // Whether there are available CCUs
  const hasCcus = hangarItems?.some(item => item.type === 'ccu');

  useEffect(() => {
    if (open) {
      // setSelectedShips([]);
      setLayerShips([]);
      setCurrentStep(0);
      setSearchTerm('');
      setCcuSearchTerm('');
      setSelectedCcus([]);
    }
  }, [open]);

  // Filter CCUs from user's hangar
  useEffect(() => {
    if (!hangarItems) return;

    let filtered = hangarItems.filter(item => item.type === 'ccu');

    if (ccuSearchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(ccuSearchTerm.toLowerCase()) ||
        (item.fromShip?.toLowerCase().includes(ccuSearchTerm.toLowerCase())) ||
        (item.toShip?.toLowerCase().includes(ccuSearchTerm.toLowerCase()))
      );
    }

    setFilteredCcus(filtered);
  }, [hangarItems, ccuSearchTerm]);

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

    // Check if it's the last step (selecting ships)
    const isLastStep = hasCcus ? currentStep === 2 : currentStep === 1;

    if (isLastStep) {
      const prevStepMsrpMin = stepShips[0].reduce((min, ship) => Math.min(min, ship.msrp), Infinity);
      filtered = filtered.filter(ship => {
        if (stepShips[0].find(s => s.id === ship.id)) {
          return false;
        }
        return ship.msrp > prevStepMsrpMin
      });

      // If there are selected CCUs, add their source and target ships to the selected ships
      if (selectedCcus.length > 0) {
        selectedCcus.forEach(ccu => {
          // Find the source and target ships for the CCU
          const fromShip = ships.find(ship => ship.name.toLowerCase() === ccu.fromShip?.toLowerCase());
          const toShip = ships.find(ship => ship.name.toLowerCase() === ccu.toShip?.toLowerCase());

          // If the corresponding ships are found, remove them from the filtered list
          if (fromShip) {
            filtered = filtered.filter(ship => ship.id !== fromShip.id);
          }
          if (toShip) {
            filtered = filtered.filter(ship => ship.id !== toShip.id);
          }
        });
      }
    }

    filtered = [...filtered].sort((a, b) => a.msrp - b.msrp);

    setFilteredShips(filtered);
  }, [ships, currentStep, stepShips, searchTerm, getCurrentLayerValue, selectedCcus, hasCcus]);

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
    // If entering the last step from CCU selection step, automatically add CCU's source and target ships
    if (hasCcus && currentStep === 1 && selectedCcus.length > 0) {
      const ccuShips: Ship[] = [];

      selectedCcus.forEach(ccu => {
        // Find the source and target ships for the CCU
        const fromShip = ships.find(ship => ship.name.toLowerCase() === ccu.fromShip?.toLowerCase());
        const toShip = ships.find(ship => ship.name.toLowerCase() === ccu.toShip?.toLowerCase());

        console.log(fromShip, toShip);

        // If the corresponding ships are found, add them to the selected ships
        if (fromShip) {
          ccuShips.push(fromShip);
        }
        if (toShip) {
          ccuShips.push(toShip);
        }
      });

      if (ccuShips.length > 0) {
        setLayerShips(prev => {
          const newLayerShips = [...prev];
          newLayerShips[1] = ccuShips;
          return newLayerShips;
        });
      }
    }

    setCurrentStep(currentStep + 1);
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

        // If there are no ships in this layer, clear this layer and subsequent layers
        if (newLayerShips[layerIndex].length === 0) {
          newLayerShips.splice(layerIndex);
        }
      }
      return newLayerShips;
    });
    updateSelectedPath();
  };

  // Remove all versions of a ship
  const removeAllShipVersions = (shipId: number, shipName: string) => {
    setLayerShips(prev => {
      const newLayerShips = [...prev];
      if (newLayerShips[currentStep]) {
        newLayerShips[currentStep] = newLayerShips[currentStep].filter(s =>
          !(s.id === shipId || s.name === `${shipName}-wb` || s.name === `${shipName}-historical`)
        );

        // If there are no ships in this layer, clear this layer
        if (newLayerShips[currentStep].length === 0) {
          newLayerShips.splice(currentStep);
        }
      }
      return newLayerShips;
    });
  };

  // Select or deselect CCU
  const toggleCcu = (ccu: HangarItem) => {
    setSelectedCcus(prev => {
      const isSelected = prev.some(item => item.id === ccu.id);
      if (isSelected) {
        return prev.filter(item => item.id !== ccu.id);
      } else {
        return [...prev, ccu];
      }
    });
  };

  // Check if a ship is part of a CCU
  const isShipPartOfCcu = (shipName: string) => {
    return selectedCcus.some(
      ccu => ccu.fromShip?.toLowerCase() === shipName.toLowerCase() ||
        ccu.toShip?.toLowerCase() === shipName.toLowerCase()
    );
  };

  // Render step title
  const renderStepTitle = () => {
    if (hasCcus) {
      // Three-step process when CCU is available
      switch (currentStep) {
        case 0:
          return <FormattedMessage id="pathBuilder.step1" defaultMessage="选择你的起始船只" />;
        case 1:
          return <FormattedMessage id="pathBuilder.step2Ccu" defaultMessage="从你的机库中选择CCU" />;
        case 2:
          return <FormattedMessage id="pathBuilder.step3" defaultMessage="选择需要包含在路径中的所有船只" />;
        default:
          return null;
      }
    } else {
      // Two-step process when no CCU is available
      switch (currentStep) {
        case 0:
          return <FormattedMessage id="pathBuilder.step1" defaultMessage="选择你的起始船只" />;
        case 1:
          return <FormattedMessage id="pathBuilder.step3" defaultMessage="选择需要包含在路径中的所有船只" />;
        default:
          return null;
      }
    }
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
            maxHeight: 'calc(100vh - 100px)',
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
              {renderStepTitle()}
            </div>
          </div>

          {(currentStep === 0 || (hasCcus && currentStep === 2) || (!hasCcus && currentStep === 1)) ? (
            // Ship selection step
            <>
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
                <div className="h-[calc(100vh-350px)] overflow-auto flex flex-col justify-start">
                  {filteredShips.map((ship) => {
                    const skus = ccus.find(c => c.id === ship.id)?.skus
                    const wb = skus?.find(sku => sku.price !== ship.msrp)
                    const historical = wbHistory?.find(wb => wb.name.trim().toUpperCase() === ship.name.trim().toUpperCase() && wb.price !== '')

                    const step = Math.min(currentStep, 1)

                    const isSelected = stepShips[step]?.some(s =>
                      s.id === ship.id &&
                      s.name === ship.name
                    );
                    const isWbSelected = stepShips[step]?.some(s => s.name === `${ship.name}-wb`);
                    const isHistoricalSelected = stepShips[step]?.some(s => s.name === `${ship.name}-historical`);

                    // Check if the ship is part of a CCU (shown in the last step)
                    const isPartOfCcu = hasCcus && currentStep === 2 && isShipPartOfCcu(ship.name);
                    const isDisabled = isPartOfCcu; // If it's part of a CCU, disable it

                    return <div key={ship.id} className="flex items-center justify-between">
                      <div
                        onClick={() => {
                          if (isDisabled) return;

                          if (isSelected) {
                            // If the normal version is already selected, deselect it
                            const shipIndex = stepShips[step]?.findIndex(s =>
                              s.id === ship.id && s.name === ship.name
                            ) || 0;
                            removeShipFromLayer(step, shipIndex);
                          } else {
                            // If selecting the normal version, first remove all versions, then add the normal version
                            removeAllShipVersions(ship.id, ship.name);
                            setLayerShips(prev => {
                              const newLayerShips = [...prev];
                              newLayerShips[step] = [...(prev[step] || []), ship];
                              return newLayerShips;
                            });
                          }
                        }}
                        className={`p-2 h-fit cursor-pointer hover:bg-amber-100 dark:hover:bg-gray-900 w-full 
                          ${isSelected ? 'bg-amber-100 dark:bg-gray-900' : ''} 
                          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                          ${isPartOfCcu ? 'bg-blue-50 dark:bg-blue-900' : ''}
                        `}
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
                              {isPartOfCcu && (
                                <div className="text-xs text-white bg-blue-500 rounded-sm px-1">
                                  <FormattedMessage id="pathBuilder.ccuPart" defaultMessage="CCU部分" />
                                </div>
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
                        (hasCcus ? currentStep === 2 : currentStep === 1) && (!isDisabled) && (<>
                          {
                            wb && <div
                              className={`flex flex-col items-center justify-center px-2 ml-2 h-full hover:bg-amber-100 dark:hover:bg-gray-900 cursor-pointer ${isWbSelected ? 'bg-amber-100 dark:bg-gray-900' : ''}`}
                              onClick={() => {
                                if (isWbSelected) {
                                  // If the Warbound version is already selected, deselect it
                                  removeShipFromLayer(step, stepShips[step]?.findIndex(s => s.name === `${ship.name}-wb`) || 0);
                                } else {
                                  // If selecting the Warbound version, first remove all versions, then add the Warbound version
                                  removeAllShipVersions(ship.id, ship.name);
                                  const wbShip = {
                                    ...ship,
                                    name: `${ship.name}-wb`,
                                  };
                                  setLayerShips(prev => {
                                    const newLayerShips = [...prev];
                                    newLayerShips[step] = [...(prev[step] || []), wbShip];
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
                                  // If the Historical version is already selected, deselect it
                                  removeShipFromLayer(step, stepShips[step]?.findIndex(s => s.name === `${ship.name}-historical`) || 0);
                                } else {
                                  // If selecting the Historical version, first remove all versions, then add the Historical version
                                  removeAllShipVersions(ship.id, ship.name);
                                  const historicalShip = {
                                    ...ship,
                                    name: `${ship.name}-historical`,
                                  };
                                  setLayerShips(prev => {
                                    const newLayerShips = [...prev];
                                    newLayerShips[step] = [...(prev[step] || []), historicalShip];
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
            </>
          ) : (
            // CCU selection step
            <>
              <div className="p-4 border-b border-gray-200">
                <input
                  type="text"
                  placeholder={intl.formatMessage({ id: 'pathBuilder.searchCcuPlaceholder', defaultMessage: 'Search CCU...' })}
                  value={ccuSearchTerm}
                  onChange={(e) => setCcuSearchTerm(e.target.value)}
                  className="border border-gray-500 rounded-md px-3 py-2 w-full"
                />
              </div>

              <div className="flex-1">
                <div className="h-[calc(100vh-600px)] overflow-auto flex flex-col justify-start">
                  {filteredCcus.length > 0 ? filteredCcus.map((ccu) => {
                    const isSelected = selectedCcus.some(item => item.id === ccu.id);

                    return (
                      <div
                        key={ccu.id}
                        className={`p-3 border-b border-gray-200 cursor-pointer hover:bg-amber-100 dark:hover:bg-gray-900 ${isSelected ? 'bg-amber-100 dark:bg-gray-900' : ''}`}
                        onClick={() => toggleCcu(ccu)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium">{ccu.name}</div>
                            <div className="text-sm text-gray-500">
                              {ccu.fromShip} ➔ {ccu.toShip}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="p-4 text-center text-gray-500">
                      <FormattedMessage id="pathBuilder.noCcus" defaultMessage="No CCUs found" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Bottom action bar */}
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
                  <FormattedMessage id="pathBuilder.prevStep" defaultMessage="Previous step" />
                )
              }
            </Button>
            {
              (hasCcus ? currentStep < 2 : currentStep < 1) ? (
                <Button
                  onClick={nextStep}
                  variant="contained"
                  disabled={
                    currentStep === 1
                      ? false
                      : !(stepShips[currentStep]?.length > 0)  // In other steps, require selected ships
                  }
                  color="primary"
                >
                  <FormattedMessage id="pathBuilder.nextStep" defaultMessage="Next step" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreatePath}
                  variant="contained"
                  disabled={!(stepShips[1]?.length > 0)}
                  color="primary"
                >
                  <FormattedMessage id="pathBuilder.createPath" defaultMessage="Create path" />
                </Button>
              )
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
