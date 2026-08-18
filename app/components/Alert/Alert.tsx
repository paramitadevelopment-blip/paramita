'use client'

import { createContext, useContext, useState, useRef } from 'react';
import { MdCheckCircle, MdError, MdInfo, MdClose } from 'react-icons/md';
import styles from './Alert.module.css';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  message: string | React.ReactNode;
  onConfirm?: () => void;
  showCancelButton?: boolean;
  verificationCode?: string;
  verificationInput?: string;
  onVerificationChange?: (value: string) => void;
}

const AlertContext = createContext<{
  showAlert: (config: Omit<AlertItem, 'id'>) => void;
} | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const showAlert = (config: Omit<AlertItem, 'id'>) => {
    const id = Date.now().toString();
    setAlerts(prev => [...prev, { ...config, id } as AlertItem]);
  };

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alerts.length > 0 && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9998,
        }}>
          <div style={{ maxWidth: 400, width: '90%' }}>
            {alerts.map(alert => (
              <AlertItem key={alert.id} alert={alert} onClose={() => removeAlert(alert.id)} />
            ))}
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}

interface AlertItemProps {
  alert: AlertItem;
  onClose: () => void;
}

function AlertItem({ alert, onClose }: AlertItemProps) {
  const [inputValue, setInputValue] = useState('');

  const iconMap = {
    success: <MdCheckCircle className={styles.icon} />,
    error: <MdError className={styles.icon} />,
    warning: <MdInfo className={styles.icon} />,
    info: <MdInfo className={styles.icon} />,
  };

  return (
    <div className={`${styles.alert} ${styles[alert.type]}`}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          {iconMap[alert.type]}
        </div>
        <div className={styles.textWrapper}>
          <h3 className={styles.title}>{alert.title}</h3>
          <div className={styles.message}>{alert.message}</div>
          {alert.verificationCode && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '18px', color: '#666', marginBottom: '8px' }}>
                확인 코드를 입력해주세요: <span style={{ fontWeight: 700, fontSize: '18px' }}>{alert.verificationCode}</span>
              </p>
              <input
                type="text"
                placeholder="코드 입력"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  alert.onVerificationChange?.(e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '16px', width: '100%' }}>
        <button
          className={styles.confirmBtn}
          onClick={() => {
            if (alert.verificationCode) {
              if (inputValue.trim() !== alert.verificationCode) {
                alert.onVerificationChange?.('');
                return;
              }
            }
            alert.onConfirm?.();
            onClose();
          }}
        >
          확인
        </button>
        {alert.showCancelButton && (
          <button
            className={styles.cancelBtn}
            onClick={onClose}
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used within AlertProvider');
  return context;
}
