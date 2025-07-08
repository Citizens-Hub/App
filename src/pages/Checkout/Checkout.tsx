import { useParams } from "react-router";
import { useEffect } from "react";

export default function Checkout() {
  const { orderId } = useParams();

  useEffect(() => {
    if (!orderId) return

    fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/orders/create-checkout-session/${orderId}`, { method: 'POST' })
      .then((response) => response.json())
      .then((json) => window.location.href = json.url)
  }, [orderId])

  return <div>Loading...</div>
}