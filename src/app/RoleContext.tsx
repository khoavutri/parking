/* eslint-disable react-refresh/only-export-components -- module context chia sẻ hook, hằng số và provider trong cùng một tệp */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db/database';
import type { Actor, Employee, RoleId } from '../types';
import { ROLE_LABEL } from '../utils/status';
import { canViewRoute, DEFAULT_PAGE_BY_ROLE } from '../services/permissions';

const ROLE_STORAGE_KEY = 'parkone.role';
const ROLE_ORDER: RoleId[] = ['MANAGER', 'ATTENDANT', 'CASHIER'];

interface RoleContextValue {
  role: RoleId;
  actor: Actor;
  ready: boolean;
  representative?: Employee;
  options: Array<{ value: RoleId; label: string; employeeName?: string }>;
  setRole: (role: RoleId) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ready, setReady] = useState(false);
  const [role, setRoleState] = useState<RoleId>(() => {
    const saved = localStorage.getItem(ROLE_STORAGE_KEY) as RoleId | null;
    return saved && ROLE_ORDER.includes(saved) ? saved : 'MANAGER';
  });

  useEffect(() => {
    let mounted = true;
    db.employees
      .filter((e) => e.active)
      .toArray()
      .then((rows) => {
        if (mounted) {
          setEmployees(rows.sort((a, b) => a.id.localeCompare(b.id)));
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const employeesByRole = useMemo(() => {
    const map = new Map<RoleId, Employee>();
    for (const employee of employees) {
      if (!map.has(employee.role)) map.set(employee.role, employee);
    }
    return map;
  }, [employees]);

  const representative = employeesByRole.get(role);

  const actor: Actor = useMemo(
    () => ({
      employeeId: representative?.id ?? `role-${role.toLowerCase()}`,
      name: representative?.name ?? ROLE_LABEL[role],
      role,
    }),
    [representative, role],
  );

  const options = useMemo(
    () =>
      ROLE_ORDER.map((r) => ({
        value: r,
        label: ROLE_LABEL[r],
        employeeName: employeesByRole.get(r)?.name,
      })),
    [employeesByRole],
  );

  const setRole = (nextRole: RoleId) => {
    setRoleState(nextRole);
    localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
  };

  const value: RoleContextValue = { role, actor, ready, representative, options, setRole };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole phải được dùng bên trong RoleProvider');
  return ctx;
}

export { canViewRoute, DEFAULT_PAGE_BY_ROLE };
