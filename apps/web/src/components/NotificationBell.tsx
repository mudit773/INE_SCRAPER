import { useEffect, useRef, useState } from "react";

export type AlertNotification = {
  id: string;
  type: "price_drop" | "back_in_stock";
  productId: string;
  productName: string;
  message: string;
  timestamp: string;
  read: boolean;
};

export function NotificationBell({
  notifications,
  onSelectProduct,
  onClear
}: {
  notifications: AlertNotification[];
  onSelectProduct: (productId: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="notification-bell-container" ref={containerRef}>
      <button
        className="bell-button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <strong>Alerts & Notifications</strong>
            {notifications.length > 0 && (
              <button className="clear-btn" onClick={onClear}>
                Clear
              </button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="empty-notifications">No alerts right now.</p>
            ) : (
              notifications.map((alert) => (
                <div
                  key={alert.id}
                  className={`notification-item ${alert.type}`}
                  onClick={() => {
                    onSelectProduct(alert.productId);
                    setOpen(false);
                  }}
                >
                  <div className="notification-icon">
                    {alert.type === "price_drop" ? "📉" : "📦"}
                  </div>
                  <div className="notification-content">
                    <span className="notification-title">
                      {alert.type === "price_drop" ? "Price Drop Alert" : "Back in Stock"}
                    </span>
                    <p className="notification-msg">{alert.message}</p>
                    <small className="notification-time">{alert.timestamp}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
