
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
import { Loader2, User, Mail, Phone, GraduationCap, Hash } from "lucide-react"
import { useAuth } from "@/context/AuthContext"


const formSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  gender: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, { message: "Phone number is too short" }),
  email: z.string().email(),
  indexNumber: z.string().min(2, "Index Number is required"),
  program: z.string().min(2, "Program is required"),
  year: z.string().min(2, "Year is required"),
  status: z.enum(["Pending", "Placed", "Completed", "Dropped"]),
})

type LearnerFormValues = z.infer<typeof formSchema>

interface LearnerFormProps {
    onSuccess: (data: unknown) => void;
    initialData?: LearnerFormValues & { _id?: string };
}

export function LearnerForm({ onSuccess, initialData }: LearnerFormProps) {
  const [loading, setLoading] = useState(false)
  const { authFetch } = useAuth()

  const form = useForm<LearnerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      gender: "Male",
      phone: "",
      email: "",
      indexNumber: "",
      program: "",
      year: "",
      status: "Pending",
    },
})

  async function onSubmit(values: LearnerFormValues) {
    setLoading(true)
    try {
        const url = initialData?._id 
            ? `http://localhost:5001/api/learners/${initialData._id}`
            : 'http://localhost:5001/api/learners';
        
        const method = initialData?._id ? 'PUT' : 'POST';

        const response = await authFetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        })

        if (!response.ok) {
            throw new Error('Failed to save learner')
        }

        const data = await response.json()
        onSuccess(data)
    } catch (error) {
        console.error(error)
    } finally {
        setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white ml-2">Full Name</FormLabel>
              <FormControl>
                <div className="relative">
                  <User className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <Input placeholder="John Doe" className="pl-14" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-6">
            <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Email</FormLabel>
                <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="john@example.com" className="pl-14" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Phone</FormLabel>
                <FormControl>
                    <div className="relative">
                      <Phone className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                      <Input placeholder="024..." className="pl-14" {...field} />
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
            name="gender"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Gender</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                    <SelectItem value="Male" className="text-white focus:bg-white/10 focus:text-white">Male</SelectItem>
                    <SelectItem value="Female" className="text-white focus:bg-white/10 focus:text-white">Female</SelectItem>
                    <SelectItem value="Other" className="text-white focus:bg-white/10 focus:text-white">Other</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
             <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
                <FormItem>
                <FormLabel className="text-white ml-2">Year</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-black/80 backdrop-blur-xl border-white/20 rounded-[1.5rem] shadow-2xl overflow-hidden">
                    <SelectItem value="Year 1" className="text-white focus:bg-white/10 focus:text-white">Year 1</SelectItem>
                    <SelectItem value="Year 2" className="text-white focus:bg-white/10 focus:text-white">Year 2</SelectItem>
                    <SelectItem value="Year 3" className="text-white focus:bg-white/10 focus:text-white">Year 3</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <div className="grid grid-cols-2 gap-6">
             <FormField
                control={form.control}
                name="indexNumber"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Index Number</FormLabel>
                    <FormControl>
                        <div className="relative">
                          <Hash className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                          <Input placeholder="GTVET/2026/001" className="pl-14" {...field} />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="program"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-white ml-2">Program</FormLabel>
                    <FormControl>
                        <div className="relative">
                          <GraduationCap className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                          <Input placeholder="Fashion Design..." className="pl-14" {...field} />
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>


        <Button type="submit" disabled={loading} className="w-full bg-[#FFB800] hover:bg-[#FFD700] text-gray-900 font-black h-14 rounded-2xl shadow-xl shadow-[#FFB800]/20 mt-6">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Register Learner
        </Button>
      </form>
    </Form>
  )
}
