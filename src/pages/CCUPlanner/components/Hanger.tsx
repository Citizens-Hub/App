import { IconButton, Link } from "@mui/material";
import { Ccu, Ship } from "../../../types";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearUpgrades, RootState } from "../../../store";
import { ExpandLess, ExpandMore, Refresh } from "@mui/icons-material";
import ExtensionModal from "./ExtensionModal";
import { FormattedMessage, useIntl } from "react-intl";

interface ShipSelectorProps {
  ships: Ship[];
  ccus: Ccu[];
  onDragStart: (event: React.DragEvent<HTMLDivElement>, ship: Ship) => void;
}

export default function Hanger({ ships, onDragStart }: ShipSelectorProps) {
  const [hangarExpanded, setHangarExpanded] = useState(true);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const intl = useIntl();
  const upgrades = useSelector((state: RootState) => state.upgrades.items);
  const dispatch = useDispatch();

  const handleExtensionLinkClick = () => {
    // 不阻止默认行为，允许实际下载
    setExtensionModalOpen(true);
  };

  // 处理刷新动画结束
  useEffect(() => {
    if (isRefreshing) {
      const timer = setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isRefreshing]);

  return (
    <>
      <div className="flex items-center justify-left gap-2 px-1">
        <FormattedMessage id="ccuPlanner.myHanger" defaultMessage="我的机库" />
        <IconButton color="primary" size="small" onClick={() => setHangarExpanded(!hangarExpanded)}>
          {hangarExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
        <IconButton
          color="primary"
          size="small"
          onClick={() => {
            setIsRefreshing(true);
            dispatch(clearUpgrades());

            window.postMessage({
              type: 'ccuPlannerAppIntegrationRequest',
              message: {
                type: "connect",
                requestId: 1
              }
            }, '*');

            window.postMessage({
              type: 'ccuPlannerAppIntegrationRequest',
              message: {
                type: "httpRequest",
                request: {
                  "url": "https://robertsspaceindustries.com/en/account/pledges?page=1&product-type=upgrade",
                  "responseType": "text",
                  "method": "get",
                  "data": null
                },
                requestId: 2
              }
            }, '*');
          }}
        >
          <Refresh className={isRefreshing ? 'animate-spin' : ''} />
        </IconButton>
      </div>
      <div className="max-h-[calc(100vh-500px)] overflow-y-auto">
        {hangarExpanded && (
          upgrades.length > 0 ?
            upgrades.map(upgrade => {
              const from = upgrade.name.split("to")[0].split("-")[1].trim().toUpperCase()
              const to = (upgrade.name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ").toUpperCase()

              const fromShip = ships.find(ship => ship.name.toUpperCase() === from)
              const toShip = ships.find(ship => ship.name.toUpperCase() === to)

              if (!fromShip || !toShip) {
                return <></>
              }

              return <div
                key={fromShip.id + toShip.id}
                className="flex flex-col w-full items-center justify-center pt-2 pb-1 gap-2 border-b border-gray-200 last:border-b-0"
              >
                <div className="text-xs text-gray-400">
                  {upgrade.name}
                </div>

                <div
                  draggable
                  onDragStart={(event) => onDragStart(event, fromShip)}
                  className="p-2 cursor-move transition-colors hover:bg-amber-100 w-full"
                >
                  <div className="flex items-center text-left">
                    <img
                      src={fromShip.medias.productThumbMediumAndSmall}
                      alt={fromShip.name}
                      className="w-16 h-16 object-cover mr-2"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{fromShip.name}</h3>
                      </div>
                      <div className="text-xs text-gray-400">{fromShip.manufacturer.name}</div>
                      <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                        <span>{(fromShip.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-400 flex items-center justify-between w-full px-3">
                  <span>↓ <FormattedMessage id="ccuPlanner.upgradeTo" defaultMessage="升级到" /></span>
                  <span className="flex items-center gap-1">
                    <FormattedMessage id="ccuPlanner.cost" defaultMessage="花费" />
                    <span className="text-blue-400 font-bold">{upgrade.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    {((toShip.msrp - fromShip.msrp) / 100) !== upgrade.value &&
                      <span className="text-xs text-gray-400 line-through">{((toShip.msrp - fromShip.msrp) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                    }
                  </span>
                </div>

                <div
                  draggable
                  onDragStart={(event) => onDragStart(event, toShip)}
                  className="p-2 cursor-move transition-colors hover:bg-amber-100 w-full"
                >
                  <div className="flex items-center text-left">
                    <img
                      src={toShip.medias.productThumbMediumAndSmall}
                      alt={toShip.name}
                      className="w-16 h-16 object-cover mr-2"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{toShip.name}</h3>
                      </div>
                      <div className="text-xs text-gray-400">{toShip.manufacturer.name}</div>
                      <div className="text-sm text-blue-400 font-bold flex items-center gap-2">
                        <span>{(toShip.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            })
            :
            <div className="text-center text-gray-400 mb-2">
              <FormattedMessage id="ccuPlanner.noData" defaultMessage="暂无数据" /> <Link href="/extension.zip" onClick={handleExtensionLinkClick}>{intl.formatMessage({ id: 'ccuPlanner.downloadBrowserExtension', defaultMessage: '下载浏览器扩展程序' })}</Link>
            </div>
        )}
      </div>
      {/* 扩展程序安装说明弹窗 */}
      <ExtensionModal 
        open={extensionModalOpen} 
        onClose={() => setExtensionModalOpen(false)} 
      />
    </>
  )
}