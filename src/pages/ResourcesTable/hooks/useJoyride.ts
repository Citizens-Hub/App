import { useState, useEffect } from 'react';
import { Step, CallBackProps } from 'react-joyride';
import { useIntl } from 'react-intl';

// 定义本地化文本接口
export interface JoyrideLocale {
  back: string;
  close: string;
  last: string;
  next: string;
  skip: string;
  open: string; // 用于Beacon的aria-label
}

export default function useJoyride() {
  const intl = useIntl();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  
  // 使用react-intl来获取本地化文本
  const locale: JoyrideLocale = {
    back: intl.formatMessage({ id: 'joyride.back', defaultMessage: '上一步' }),
    close: intl.formatMessage({ id: 'joyride.close', defaultMessage: '关闭' }),
    last: intl.formatMessage({ id: 'joyride.last', defaultMessage: '完成' }),
    next: intl.formatMessage({ id: 'joyride.next', defaultMessage: '下一步' }),
    skip: intl.formatMessage({ id: 'joyride.skip', defaultMessage: '跳过引导' }),
    open: intl.formatMessage({ id: 'joyride.open', defaultMessage: '打开引导' })
  };
  
  const [steps] = useState<Step[]>([
    // {
    //   target: '.app-header',
    //   content: '欢迎使用订阅商店！这里是应用的导航栏。',
    //   disableBeacon: true,
    // },
    {
      target: '.search-box',
      content: intl.formatMessage({ id: 'joyride.content.search', defaultMessage: '在这里可以搜索您想要的产品' }),
      title: intl.formatMessage({ id: 'joyride.title.search', defaultMessage: '搜索功能' }),
      disableBeacon: true,
    },
    {
      target: '.image-slideshow',
      content: intl.formatMessage({ id: 'joyride.content.image', defaultMessage: '点击图片可以放大查看' }),
    },
    {
      target: '.add-to-cart-button',
      content: intl.formatMessage({ id: 'joyride.content.addToCart', defaultMessage: '点击这里将物品添加到购物清单' }),
      title: intl.formatMessage({ id: 'joyride.title.addToCart', defaultMessage: '添加到清单' }),
    },
    {
      target: '.cart-button',
      content: intl.formatMessage({ id: 'joyride.content.cart', defaultMessage: '点击这里查看您的购物清单，在这里你可以查看意向购买物品价值，你也可以将购物清单截图发送给卖家' }),
      title: intl.formatMessage({ id: 'joyride.title.cart', defaultMessage: '购物清单' }),
    },
  ]);

  // 检查是否是首次访问
  useEffect(() => {
    const hasVisitedBefore = localStorage.getItem('hasVisitedBefore');
    if (!hasVisitedBefore) {
      // 首次访问，启动引导
      setRun(true);
      localStorage.setItem('hasVisitedBefore', 'true');
    }
  }, []);

  // 处理Joyride回调
  const handleJoyrideCallback = (data: CallBackProps) => {
    const { index, status, type } = data;

    if (([
      'finished', 'skipped'
    ].includes(status))) {
      // 用户完成或跳过了引导
      setRun(false);
      setStepIndex(0);
    } else if (([
      'step:after', 'beacon:clicked'
    ].includes(type))) {
      // 更新当前步骤
      setStepIndex(index + 1);
    }
  };

  // 重置并开始引导
  const startJoyride = () => {
    setStepIndex(0);
    setRun(true);
  };

  return {
    run,
    steps,
    stepIndex,
    locale,
    startJoyride,
    handleJoyrideCallback
  };
} 