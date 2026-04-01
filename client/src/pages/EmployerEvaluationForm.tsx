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
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

const formSchema = z.object({
  learner: z.string().min(1, "Learner is required"),
  evaluatorName: z.string().min(2, "Evaluator Name is required"),
  evaluatorPosition: z.string().min(2, "Evaluator Position is required"),
  metrics: z.object({
      punctualityAndAttendance: z.number().min(1).max(5).int(),
      technicalSkills: z.number().min(1).max(5).int(),
      abilityToLearn: z.number().min(1).max(5).int(),
      teamworkAndCommunication: z.number().min(1).max(5).int(),
      initiativeAndProblemSolving: z.number().min(1).max(5).int(),
  }),
  overallScore: z.number().min(1).max(5).int(),
  strengths: z.string().min(5, "Please list strengths"),
  areasForImprovement: z.string().min(5, "Please list areas for improvement"),
  wouldHire: z.boolean(),
  additionalComments: z.string().optional()
})

type EvaluationFormValues = z.infer<typeof formSchema>

interface EmployerEvaluationFormProps {
    onSuccess: () => void;
    learnerId: string;
}

export function EmployerEvaluationForm({ onSuccess, learnerId }: EmployerEvaluationFormProps) {
  const [loading, setLoading] = useState(false)
  const { authFetch } = useAuth()
  const normalizeSliderValue = (value: number) => (Number.isFinite(value) ? value : 1)

  const form = useForm<EvaluationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      learner: learnerId,
      evaluatorName: "",
      evaluatorPosition: "",
      metrics: {
          punctualityAndAttendance: 3,
          technicalSkills: 3,
          abilityToLearn: 3,
          teamworkAndCommunication: 3,
          initiativeAndProblemSolving: 3,
      },
      overallScore: 3,
      strengths: "",
      areasForImprovement: "",
      wouldHire: true,
      additionalComments: "",
    },
  })

  async function onSubmit(values: EvaluationFormValues) {
    setLoading(true)
    try {
        const response = await authFetch('/api/partner-portal/evaluations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        if (!response.ok) throw new Error('Failed to submit evaluation')
        onSuccess()
    } catch (error) {
        console.error("Error submitting evaluation:", error)
    } finally {
        setLoading(false)
    }
  }

  const renderMetricSlider = (name: "metrics.punctualityAndAttendance" | "metrics.technicalSkills" | "metrics.abilityToLearn" | "metrics.teamworkAndCommunication" | "metrics.initiativeAndProblemSolving" | "overallScore", label: string) => (
      <FormField
          control={form.control}
          name={name}
          render={({ field }) => (
              <FormItem>
              <FormLabel className="text-sm font-semibold text-white">{label} (1-5)</FormLabel>
              <FormControl>
                  <div className="flex items-center bg-[#F5F5FA] rounded-xl h-12 px-3">
                     <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="1"
                        value={normalizeSliderValue(field.value as number)}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-indigo-500 mx-2"
                     />
                     <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                         {field.value}
                     </span>
                  </div>
              </FormControl>
              <FormMessage />
              </FormItem>
          )}
      />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="evaluatorName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Evaluator Name</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="evaluatorPosition" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Evaluator Position</FormLabel>
                  <FormControl><Input placeholder="HR Manager" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="font-bold text-sm text-gray-900">Core Metrics</h3>
            {renderMetricSlider("metrics.punctualityAndAttendance", "Punctuality & Attendance")}
            {renderMetricSlider("metrics.technicalSkills", "Technical Skills")}
            {renderMetricSlider("metrics.abilityToLearn", "Ability to Learn")}
            {renderMetricSlider("metrics.teamworkAndCommunication", "Teamwork & Communication")}
            {renderMetricSlider("metrics.initiativeAndProblemSolving", "Initiative & Problem Solving")}
        </div>

        <div className="pt-4 border-t border-gray-100">
            <h3 className="font-bold text-sm text-gray-900 mb-3">Overall Performance</h3>
            {renderMetricSlider("overallScore", "Overall Impression")}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">
            <FormField control={form.control} name="strengths" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Key Strengths</FormLabel>
                  <FormControl><Textarea placeholder="What did the learner do well?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="areasForImprovement" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-white">Areas for Improvement</FormLabel>
                  <FormControl><Textarea placeholder="What can they improve?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="additionalComments" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-white">Additional Comments</FormLabel>
              <FormControl><Textarea placeholder="Any other feedback?" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <FormField control={form.control} name="wouldHire" render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-transparent p-4 bg-[#F5F5FA]">
              <FormControl>
                  <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-5 w-5 rounded border-gray-300 text-indigo-500 focus:ring-indigo-400 mt-0.5"
                  />
              </FormControl>
              <div className="space-y-0.5 leading-none">
                  <FormLabel className="font-semibold text-gray-800 text-sm">Would Hire</FormLabel>
                  <p className="text-xs text-gray-500">Would you consider hiring this learner in the future?</p>
              </div>
            </FormItem>
        )} />

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          Submit Evaluation
        </Button>
      </form>
    </Form>
  )
}
