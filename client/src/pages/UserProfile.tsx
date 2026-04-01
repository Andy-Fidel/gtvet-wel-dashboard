import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Building2, Phone, MapPin, Shield, Edit2, Loader2, Camera } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

export default function UserProfile() {
  const { user, authFetch, token } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.profilePicture || '');
  const [formData, setFormData] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/documents/user-profile-picture', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setAvatarUrl(data.url)
    } catch {
      console.error('Avatar upload failed')
    } finally {
      setAvatarUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadgeColor = (role: string) => {
    switch(role) {
      case 'SuperAdmin': return 'bg-purple-500';
      case 'RegionalAdmin': return 'bg-indigo-500';
      case 'Admin': return 'bg-blue-500';
      case 'Manager': return 'bg-green-500';
      case 'IndustryPartner': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'SuperAdmin': return 'Super Admin';
      case 'RegionalAdmin': return 'Regional Admin';
      case 'IndustryPartner': return 'Industry Partner';
      default: return role;
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user?._id) return;

    setIsLoading(true);
    try {
      const response = await authFetch(`/api/users/${user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update profile');
      }

      toast.success("Profile updated successfully");
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || "",
      phone: user?.phone || "",
    });
    setIsEditing(false);
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex-1 flex-col space-y-6 pt-16 px-4 pb-4 sm:p-8 flex max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
            My Profile
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage your personal information and account details
          </p>
        </div>
        <Button
          variant={isEditing ? "outline" : "default"}
          onClick={() => isEditing ? handleCancel() : setIsEditing(true)}
          className={isEditing ? "" : "bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold"}
        >
          {isEditing ? (
            "Cancel"
          ) : (
            <>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit Profile
            </>
          )}
        </Button>
      </div>

      {/* Profile Card */}
      <Card className="border-0 shadow-lg rounded-3xl overflow-hidden">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-[#FFB800] to-[#FF9500] relative" />

        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-end -mt-16 mb-6 gap-4">
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="relative h-24 w-24 rounded-3xl border-4 border-white shadow-lg overflow-hidden group cursor-pointer shrink-0"
            >
              <input
                ref={avatarInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleAvatarUpload}
              />
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[#FFB800]/10 flex items-center justify-center">
                  <span className="text-[#FFB800] text-2xl font-black">{getInitials(user.name)}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {avatarUploading ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </button>
            <div className="flex-1">
              <h3 className="text-xl font-black text-gray-900">{user.name}</h3>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
            <Badge className={`${getRoleBadgeColor(user.role)} text-white border-0 px-3 py-1`}>
              {getRoleLabel(user.role)}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full Name */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <User className="h-4 w-4 text-[#FFB800]" />
                Full Name
              </Label>
              {isEditing ? (
                <Input
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="h-12 rounded-xl"
                />
              ) : (
                <div className="h-12 px-4 rounded-xl bg-gray-50 flex items-center text-gray-900 font-medium">
                  {user.name}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#FFB800]" />
                Email Address
              </Label>
              <div className="h-12 px-4 rounded-xl bg-gray-100 flex items-center text-gray-600">
                {user.email}
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#FFB800]" />
                Phone Number
              </Label>
              {isEditing ? (
                <Input
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="Add phone number"
                  className="h-12 rounded-xl"
                />
              ) : (
                <div className="h-12 px-4 rounded-xl bg-gray-50 flex items-center text-gray-900 font-medium">
                  {user.phone || <span className="text-gray-400 italic">Not provided</span>}
                </div>
              )}
            </div>

            {/* Institution / Company */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#FFB800]" />
                {user.role === 'IndustryPartner' ? 'Company' : 'Institution'}
              </Label>
              <div className="h-12 px-4 rounded-xl bg-gray-50 flex items-center text-gray-900 font-medium">
                {user.role === 'IndustryPartner' 
                  ? (user.partnerId?.name || 'Partner Profile') 
                  : (user.institution || <span className="text-gray-400 italic">Not assigned</span>)}
              </div>
            </div>

            {/* Region */}
            {user.region && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#FFB800]" />
                  Region
                </Label>
                <div className="h-12 px-4 rounded-xl bg-gray-50 flex items-center text-gray-900 font-medium">
                  {user.region}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#FFB800]" />
                Account Status
              </Label>
              <div className="h-12 px-4 rounded-xl bg-gray-50 flex items-center">
                <Badge
                  variant={user.status === 'Active' ? 'default' : 'secondary'}
                  className={user.status === 'Active' ? 'bg-green-500 text-white' : 'bg-gray-400'}
                >
                  {user.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Save Button */}
          {isEditing && (
            <div className="mt-8 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="h-12 px-6 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading}
                className="h-12 px-8 rounded-xl bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card className="border-0 shadow-lg rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#FFB800]" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">Password</p>
              <p className="text-sm text-muted-foreground">
                Last changed recently. Keep your account secure.
              </p>
            </div>
            <Button
              variant="outline"
              className="h-12 px-6 rounded-xl border-gray-200"
              onClick={() => toast.info("Password change functionality coming soon")}
            >
              Change Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
