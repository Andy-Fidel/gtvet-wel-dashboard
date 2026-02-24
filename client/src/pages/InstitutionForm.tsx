
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { Loader2, Building2, Hash, MapPin, Map, Layers, School, Users } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().min(2, "Code is required"),
  district: z.string().min(2, "District is required"),
  region: z.string().min(1, "Region is required"),
  location: z.string().min(2, "Location is required"),
  category: z.enum(["A", "B", "C"]),
  status: z.enum(["Day", "Boarding"]),
  gender: z.enum(["Boys", "Girls", "Mixed"]),
})

type InstitutionFormValues = z.infer<typeof formSchema>

interface InstitutionFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: any;
}

export function InstitutionForm({ onSuccess, initialData }: InstitutionFormProps) {
  const [loading, setLoading] = useState(false)
  const { authFetch } = useAuth()

  const form = useForm<InstitutionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      code: "",
      district: "",
      region: "",
      location: "",
      category: "A",
      status: "Day",
      gender: "Mixed",
    },
  })

  async function onSubmit(values: InstitutionFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id 
            ? `http://localhost:5001/api/institutions/${initialData._id}`
            : 'http://localhost:5001/api/institutions';
        
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        })

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save institution')
        }

        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error(error)
        toast.error(error instanceof Error ? error.message : "Failed to save institution")
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Institution Name</FormLabel>
                <FormControl>
                    <div className="relative">
                    <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                    <Input placeholder="Ghana Tech Institute" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Institution Code</FormLabel>
                <FormControl>
                    <div className="relative">
                    <Hash className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                    <Input placeholder="GTI-001" className="pl-14 uppercase" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <div className="grid grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="district"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">District</FormLabel>
                <FormControl>
                    <div className="relative">
                    <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                    <Input placeholder="Accra Metro" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="region"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Region</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <div className="relative">
                            <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                            <SelectTrigger className="pl-14">
                                <SelectValue placeholder="Select region" />
                            </SelectTrigger>
                        </div>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden max-h-[300px]">
                        <SelectItem value="Ahafo" className="text-white focus:bg-white/10 focus:text-white">Ahafo</SelectItem>
                        <SelectItem value="Ashanti" className="text-white focus:bg-white/10 focus:text-white">Ashanti</SelectItem>
                        <SelectItem value="Bono" className="text-white focus:bg-white/10 focus:text-white">Bono</SelectItem>
                        <SelectItem value="Bono East" className="text-white focus:bg-white/10 focus:text-white">Bono East</SelectItem>
                        <SelectItem value="Central" className="text-white focus:bg-white/10 focus:text-white">Central</SelectItem>
                        <SelectItem value="Eastern" className="text-white focus:bg-white/10 focus:text-white">Eastern</SelectItem>
                        <SelectItem value="Greater Accra" className="text-white focus:bg-white/10 focus:text-white">Greater Accra</SelectItem>
                        <SelectItem value="North East" className="text-white focus:bg-white/10 focus:text-white">North East</SelectItem>
                        <SelectItem value="Northern" className="text-white focus:bg-white/10 focus:text-white">Northern</SelectItem>
                        <SelectItem value="Oti" className="text-white focus:bg-white/10 focus:text-white">Oti</SelectItem>
                        <SelectItem value="Savannah" className="text-white focus:bg-white/10 focus:text-white">Savannah</SelectItem>
                        <SelectItem value="Upper East" className="text-white focus:bg-white/10 focus:text-white">Upper East</SelectItem>
                        <SelectItem value="Upper West" className="text-white focus:bg-white/10 focus:text-white">Upper West</SelectItem>
                        <SelectItem value="Volta" className="text-white focus:bg-white/10 focus:text-white">Volta</SelectItem>
                        <SelectItem value="Western" className="text-white focus:bg-white/10 focus:text-white">Western</SelectItem>
                        <SelectItem value="Western North" className="text-white focus:bg-white/10 focus:text-white">Western North</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Specific Location</FormLabel>
                <FormControl>
                    <div className="relative">
                    <Map className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                    <Input placeholder="East Legon" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

        <div className="grid grid-cols-3 gap-4">
            <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <div className="relative">
                            <Layers className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                            <SelectTrigger className="pl-14">
                                <SelectValue placeholder="Cat" />
                            </SelectTrigger>
                        </div>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                    <SelectItem value="A" className="text-white focus:bg-white/10 focus:text-white">Category A</SelectItem>
                    <SelectItem value="B" className="text-white focus:bg-white/10 focus:text-white">Category B</SelectItem>
                    <SelectItem value="C" className="text-white focus:bg-white/10 focus:text-white">Category C</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <div className="relative">
                            <School className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                            <SelectTrigger className="pl-14">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                        </div>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                    <SelectItem value="Day" className="text-white focus:bg-white/10 focus:text-white">Day</SelectItem>
                    <SelectItem value="Boarding" className="text-white focus:bg-white/10 focus:text-white">Boarding</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Gender</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <div className="relative">
                            <Users className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40 z-10" />
                            <SelectTrigger className="pl-14">
                                <SelectValue placeholder="Gender" />
                            </SelectTrigger>
                        </div>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                    <SelectItem value="Boys" className="text-white focus:bg-white/10 focus:text-white">Boys</SelectItem>
                    <SelectItem value="Girls" className="text-white focus:bg-white/10 focus:text-white">Girls</SelectItem>
                    <SelectItem value="Mixed" className="text-white focus:bg-white/10 focus:text-white">Mixed</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-12 rounded-2xl shadow-lg mt-4 transition-all">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? "Update Institution" : "Register Institution"}
        </Button>
      </form>
    </Form>
  )
}
