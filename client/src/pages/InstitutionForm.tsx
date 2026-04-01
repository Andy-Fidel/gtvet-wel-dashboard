
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
import { Loader2 } from "lucide-react"
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
    initialData?: Partial<InstitutionFormValues> & { _id?: string };
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
        const url = initialData?._id ? `/api/institutions/${initialData._id}` : '/api/institutions';
        const response = await authFetch(url, {
            method: initialData?._id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Institution Name</FormLabel>
                  <FormControl><Input placeholder="Ghana Tech Institute" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Institution Code</FormLabel>
                  <FormControl><Input placeholder="GTI-001" className="uppercase" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-2 gap-5">
            <FormField control={form.control} name="district" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">District</FormLabel>
                  <FormControl><Input placeholder="Accra Metro" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="region" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Region</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-[300px]">
                        <SelectItem value="Ahafo">Ahafo</SelectItem>
                        <SelectItem value="Ashanti">Ashanti</SelectItem>
                        <SelectItem value="Bono">Bono</SelectItem>
                        <SelectItem value="Bono East">Bono East</SelectItem>
                        <SelectItem value="Central">Central</SelectItem>
                        <SelectItem value="Eastern">Eastern</SelectItem>
                        <SelectItem value="Greater Accra">Greater Accra</SelectItem>
                        <SelectItem value="North East">North East</SelectItem>
                        <SelectItem value="Northern">Northern</SelectItem>
                        <SelectItem value="Oti">Oti</SelectItem>
                        <SelectItem value="Savannah">Savannah</SelectItem>
                        <SelectItem value="Upper East">Upper East</SelectItem>
                        <SelectItem value="Upper West">Upper West</SelectItem>
                        <SelectItem value="Volta">Volta</SelectItem>
                        <SelectItem value="Western">Western</SelectItem>
                        <SelectItem value="Western North">Western North</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="location" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Specific Location</FormLabel>
              <FormControl><Input placeholder="East Legon" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <div className="grid grid-cols-3 gap-5">
            <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="A">Category A</SelectItem>
                      <SelectItem value="B">Category B</SelectItem>
                      <SelectItem value="C">Category C</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Boarding">Boarding</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Boys">Boys</SelectItem>
                      <SelectItem value="Girls">Girls</SelectItem>
                      <SelectItem value="Mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm mt-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initialData?._id ? "Update Institution" : "Register Institution"}
        </Button>
      </form>
    </Form>
  )
}
