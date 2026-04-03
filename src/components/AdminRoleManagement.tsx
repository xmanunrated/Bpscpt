import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { Shield, User, UserCheck, UserCog, UserMinus, Search, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Role } from "../lib/permissions";

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  photoURL?: string;
  createdAt: string;
}

const ROLES: { value: Role; label: string; icon: any; color: string }[] = [
  { value: "admin", label: "Administrator", icon: Shield, color: "text-red-500 bg-red-50" },
  { value: "content_manager", label: "Content Manager", icon: UserCog, color: "text-blue-500 bg-blue-50" },
  { value: "support_staff", label: "Support Staff", icon: UserCheck, color: "text-green-500 bg-green-50" },
  { value: "user", label: "Standard User", icon: User, color: "text-gray-500 bg-gray-50" },
];

export const AdminRoleManagement: React.FC<{ currentUserRole?: Role; isSuperAdmin?: boolean }> = ({ currentUserRole, isSuperAdmin }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageRoles = currentUserRole === 'admin' || isSuperAdmin;

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id
      })) as UserProfile[];
      setUsers(usersData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching users:", err);
      setError("You don't have permission to view users.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (!canManageRoles) {
      setError("Only administrators can manage roles.");
      return;
    }
    setUpdatingId(userId);
    setError(null);
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { role: newRole });
    } catch (err) {
      console.error("Error updating role:", err);
      setError("Failed to update user role. Check your permissions.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          Role Management
        </h1>
        <p className="text-gray-500 mt-2">Manage user roles and permissions across the platform.</p>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700"
        >
          <AlertCircle className="w-5 h-5" />
          {error}
        </motion.div>
      )}

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search users by name or email..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all shadow-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-bottom border-gray-200">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Role</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assign Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <AnimatePresence mode="popLayout">
                {filteredUsers.map((user) => (
                  <motion.tr 
                    layout
                    key={user.uid}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.photoURL ? (
                          <img src={user.photoURL} alt={user.displayName} className="w-10 h-10 rounded-full border border-gray-100" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                            <User className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{user.displayName || "Anonymous"}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {ROLES.find(r => r.value === user.role) && (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${ROLES.find(r => r.value === user.role)?.color}`}>
                          {React.createElement(ROLES.find(r => r.value === user.role)!.icon, { className: "w-3.5 h-3.5" })}
                          {ROLES.find(r => r.value === user.role)?.label}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {ROLES.map((role) => (
                          <button
                            key={role.value}
                            onClick={() => handleRoleChange(user.uid, role.value)}
                            disabled={updatingId === user.uid || user.role === role.value || !canManageRoles}
                            className={`p-2 rounded-lg transition-all ${
                              user.role === role.value 
                                ? "bg-primary text-white shadow-md cursor-default" 
                                : `bg-gray-50 text-gray-600 ${canManageRoles ? 'hover:bg-gray-100' : 'cursor-not-allowed'} disabled:opacity-50`
                            }`}
                            title={!canManageRoles ? "Only administrators can change roles" : role.label}
                          >
                            <role.icon className="w-4 h-4" />
                          </button>
                        ))}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        
        {filteredUsers.length === 0 && (
          <div className="p-12 text-center text-gray-500 italic">
            No users found matching your search.
          </div>
        )}
      </div>
    </div>
  );
};
