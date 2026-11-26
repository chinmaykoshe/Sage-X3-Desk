import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import api, { getApiError } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '../../context/ToastContext';
import { ROLE_LABELS } from '../../utils/constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Loader from '../ui/Loader';

export default function AccessControlPanel() {
  const { users } = useWorkspace();
  const { addToast } = useToast();

  const [screens, setScreens] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [copySourceId, setCopySourceId] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state for selected user
  const [role, setRole] = useState('developer');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [grantedScreens, setGrantedScreens] = useState([]);
  const [revokedScreens, setRevokedScreens] = useState([]);
  const [actionGrants, setActionGrants] = useState({});
  const [actionDenies, setActionDenies] = useState({});

  // Custom group creation state
  const [groupModal, setGroupModal] = useState({ open: false, name: '', description: '', screens: [] });

  const loadMeta = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, gRes] = await Promise.all([api.get('/rbac/screens'), api.get('/rbac/groups')]);
      setScreens(sRes.data.data || []);
      setGroups(gRes.data.data || []);
    } catch (err) {
      addToast(getApiError(err, 'Failed to load RBAC metadata'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      const firstNonAdmin = users.find((u) => u.role !== 'admin') || users[0];
      setSelectedUserId(firstNonAdmin._id);
    }
  }, [users, selectedUserId]);

  const loadUserAccess = useCallback(async () => {
    if (!selectedUserId) return;
    try {
      const { data } = await api.get(`/rbac/users/${selectedUserId}`);
      const d = data.data;
      setUserDetail(d);
      setRole(d.user.role);
      setSelectedGroups((d.config?.permissionGroups || []).map(String));
      setGrantedScreens(d.config?.screenPermissions || []);
      setRevokedScreens(d.config?.revokedScreens || []);
      setActionGrants(d.config?.actionOverrides?.grant || {});
      setActionDenies(d.config?.actionOverrides?.deny || {});
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  }, [selectedUserId, addToast]);

  useEffect(() => {
    loadUserAccess();
  }, [loadUserAccess]);

  const toggleScreen = (screenKey) => {
    const isCurrentlyEffective =
      grantedScreens.includes(screenKey) ||
      (!revokedScreens.includes(screenKey) && userDetail?.effective?.screens?.includes(screenKey));

    if (isCurrentlyEffective) {
      setGrantedScreens((prev) => prev.filter((k) => k !== screenKey));
      setRevokedScreens((prev) => Array.from(new Set([...prev, screenKey])));
    } else {
      setRevokedScreens((prev) => prev.filter((k) => k !== screenKey));
      setGrantedScreens((prev) => Array.from(new Set([...prev, screenKey])));
    }
  };

  const handleSelectAll = () => {
    setRevokedScreens([]);
    setGrantedScreens(screens.map((s) => s.screenKey));
  };

  const handleClearAll = () => {
    setGrantedScreens([]);
    setRevokedScreens(screens.map((s) => s.screenKey));
  };

  const toggleAction = (screenKey, action) => {
    const currentlyAllowed =
      (actionGrants[screenKey] || []).includes(action) ||
      (!(actionDenies[screenKey] || []).includes(action) &&
        userDetail?.effective?.actions?.[screenKey]?.includes(action));

    if (currentlyAllowed) {
      setActionGrants((prev) => ({
        ...prev,
        [screenKey]: (prev[screenKey] || []).filter((a) => a !== action),
      }));
      setActionDenies((prev) => ({
        ...prev,
        [screenKey]: Array.from(new Set([...(prev[screenKey] || []), action])),
      }));
    } else {
      setActionDenies((prev) => ({
        ...prev,
        [screenKey]: (prev[screenKey] || []).filter((a) => a !== action),
      }));
      setActionGrants((prev) => ({
        ...prev,
        [screenKey]: Array.from(new Set([...(prev[screenKey] || []), action])),
      }));
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await api.put(`/rbac/users/${selectedUserId}`, {
        role,
        permissionGroups: selectedGroups,
        screenPermissions: grantedScreens,
        revokedScreens,
        actionOverrides: { grant: actionGrants, deny: actionDenies },
      });
      addToast('Screen & action permissions saved');
      loadUserAccess();
    } catch (err) {
      addToast(getApiError(err, 'Failed to save permissions'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPermissions = async () => {
    if (!selectedUserId || !copySourceId || copySourceId === selectedUserId) return;
    try {
      await api.post(`/rbac/users/${selectedUserId}/copy-from/${copySourceId}`);
      addToast('Copied permissions from selected employee');
      loadUserAccess();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await api.post('/rbac/groups', {
        name: groupModal.name,
        description: groupModal.description,
        screenPermissions: groupModal.screens,
      });
      addToast('Permission group created');
      setGroupModal({ open: false, name: '', description: '', screens: [] });
      loadMeta();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      await api.delete(`/rbac/groups/${groupId}`);
      addToast('Permission group deleted');
      loadMeta();
      loadUserAccess();
    } catch (err) {
      addToast(getApiError(err), 'error');
    }
  };

  if (loading) return <Loader label="Loading screen registry & permission groups..." />;

  const groupedScreens = screens.reduce((acc, s) => {
    acc[s.navigationGroup] = acc[s.navigationGroup] || [];
    acc[s.navigationGroup].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* User Selector & Copy Toolbar */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#777777] mb-1">Select User or Team Lead</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="rounded-lg border border-[#E8E8E5] bg-white px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              >
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({ROLE_LABELS[u.role] || u.role})
                  </option>
                ))}
              </select>
            </div>

            {userDetail && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-[#777777] mb-1">Role Template</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={userDetail.user.role === 'admin'}
                    className="rounded-lg border border-[#E8E8E5] bg-white px-3 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
                  >
                    <option value="admin">Administrator</option>
                    <option value="team_lead">Team Lead / Manager</option>
                    <option value="developer">Developer / Employee</option>
                  </select>
                </div>
                <div className="pt-4 flex items-center gap-2">
                  <Badge variant={userDetail.user.status === 'Active' ? 'success' : 'warning'}>
                    {userDetail.user.status}
                  </Badge>
                  <span className="text-[11px] text-[#777777]">{userDetail.user.email}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
            >
              <option value="">Copy permissions from...</option>
              {users
                .filter((u) => u._id !== selectedUserId)
                .map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName}
                  </option>
                ))}
            </select>
            <Button size="sm" variant="secondary" onClick={handleCopyPermissions} disabled={!copySourceId}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="secondary" onClick={handleSelectAll}>Select All</Button>
            <Button size="sm" variant="secondary" onClick={handleClearAll}>Clear All</Button>
            <Button size="sm" onClick={handleSavePermissions} disabled={saving}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> {saving ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        </div>
        {userDetail?.config?.updatedAt && (
          <div className="mt-2 text-[11px] text-[#777777]">
            Last updated {dayjs(userDetail.config.updatedAt).format('DD MMM YYYY HH:mm')} by {userDetail.config.updatedBy?.fullName || 'Admin'}
          </div>
        )}
      </Card>

      {/* Permission Groups Assignment & Builder */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Custom Permission Groups ({groups.length})</h3>
            <p className="text-xs text-[#777777]">Assign reusable group templates to this employee or create new groups</p>
          </div>
          <Button size="xs" variant="secondary" onClick={() => setGroupModal((g) => ({ ...g, open: !g.open }))}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Group
          </Button>
        </div>

        {groupModal.open && (
          <form onSubmit={handleCreateGroup} className="mb-4 rounded-xl border border-[#E8E8E5] dark:border-[#2C2E33] p-3 space-y-2 text-xs bg-[#F4F4F2]/50 dark:bg-white/[0.02]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                required
                placeholder="Group Name (e.g. Finance Support)"
                value={groupModal.name}
                onChange={(e) => setGroupModal({ ...groupModal, name: e.target.value })}
                className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
              <input
                placeholder="Description..."
                value={groupModal.description}
                onChange={(e) => setGroupModal({ ...groupModal, description: e.target.value })}
                className="rounded-lg border border-[#E8E8E5] bg-white px-2.5 py-1.5 dark:border-[#2C2E33] dark:bg-[#1E2025]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {screens.map((s) => (
                <label key={s.screenKey} className="inline-flex items-center gap-1 rounded border border-[#E8E8E5] bg-white px-2 py-1 dark:border-[#2C2E33] dark:bg-[#1E2025] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupModal.screens.includes(s.screenKey)}
                    onChange={() =>
                      setGroupModal((prev) => ({
                        ...prev,
                        screens: prev.screens.includes(s.screenKey)
                          ? prev.screens.filter((k) => k !== s.screenKey)
                          : [...prev.screens, s.screenKey],
                      }))
                    }
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="secondary" type="button" onClick={() => setGroupModal({ open: false, name: '', description: '', screens: [] })}>Cancel</Button>
              <Button size="xs" type="submit">Create Group</Button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          {groups.length === 0 ? (
            <span className="text-[#777777]">No custom permission groups created yet.</span>
          ) : (
            groups.map((g) => {
              const checked = selectedGroups.includes(String(g._id));
              return (
                <div
                  key={g._id}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                    checked ? 'border-[#171717] bg-[#C6F36B]/30 dark:border-[#C6F36B]' : 'border-[#E8E8E5] dark:border-[#2C2E33]'
                  }`}
                >
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedGroups((prev) =>
                          checked ? prev.filter((id) => id !== String(g._id)) : [...prev, String(g._id)]
                        )
                      }
                    />
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-[10px] text-[#777777]">({g.screenPermissions?.length || 0} screens)</span>
                  </label>
                  <button type="button" onClick={() => handleDeleteGroup(g._id)} className="text-[#777777] hover:text-[#F16D64]">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Hierarchical Screen & Granular Action Permission Tree */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.entries(groupedScreens).map(([groupName, items]) => (
          <Card key={groupName}>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#777777] mb-3">{groupName}</h4>
            <div className="space-y-3 text-xs">
              {items.map((scr) => {
                const screenChecked =
                  role === 'admin' ||
                  (!revokedScreens.includes(scr.screenKey) &&
                    (grantedScreens.includes(scr.screenKey) || userDetail?.effective?.screens?.includes(scr.screenKey)));

                return (
                  <div key={scr.screenKey} className="rounded-lg border border-[#E8E8E5] dark:border-[#26282D] p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={role === 'admin'}
                          checked={!!screenChecked}
                          onChange={() => toggleScreen(scr.screenKey)}
                        />
                        <span>{scr.label}</span>
                        <code className="text-[10px] font-normal text-[#777777]">{scr.route}</code>
                      </label>
                      {revokedScreens.includes(scr.screenKey) && <Badge variant="danger">Explicitly Denied</Badge>}
                    </div>

                    {scr.availableActions?.length > 0 && screenChecked && (
                      <div className="flex flex-wrap gap-1.5 pl-5">
                        {scr.availableActions.map((act) => {
                          const denies = actionDenies[scr.screenKey] || [];
                          const grants = actionGrants[scr.screenKey] || [];
                          const actChecked =
                            role === 'admin' ||
                            (!denies.includes(act) &&
                              (grants.includes(act) || userDetail?.effective?.actions?.[scr.screenKey]?.includes(act)));

                          return (
                            <label
                              key={act}
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] cursor-pointer border ${
                                actChecked
                                  ? 'border-[#638BEF]/40 bg-[#638BEF]/10 text-[#171717] dark:text-white'
                                  : 'border-[#E8E8E5] text-[#777777] dark:border-[#2C2E33]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={role === 'admin'}
                                checked={!!actChecked}
                                onChange={() => toggleAction(scr.screenKey, act)}
                              />
                              <span>{act.replace(/_/g, ' ')}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Effective Access Preview & Permission Change History */}
      {userDetail && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <Card>
            <h4 className="font-semibold uppercase tracking-wider text-[#777777] mb-2">
              Effective Access Preview ({userDetail.effective?.screens?.length || 0} screens)
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {(userDetail.effective?.screens || []).map((sk) => (
                <Badge key={sk} variant="success">{sk}</Badge>
              ))}
            </div>
          </Card>
          <Card>
            <h4 className="font-semibold uppercase tracking-wider text-[#777777] mb-2">
              Permission Audit History
            </h4>
            <div className="space-y-1.5">
              {(userDetail.history || []).length === 0 ? (
                <span className="text-[#777777]">No permission changes logged for this user yet.</span>
              ) : (
                userDetail.history.map((h) => (
                  <div key={h._id} className="flex justify-between border-b border-[#E8E8E5]/60 dark:border-[#26282D] pb-1">
                    <span>{h.action} by {h.actorId?.fullName || 'Admin'}</span>
                    <span className="text-[#777777]">{dayjs(h.timestamp).format('DD MMM HH:mm')}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
