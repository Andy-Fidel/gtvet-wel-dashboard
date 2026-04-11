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
import { useMemo, useState } from "react"
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

export interface EmployerEvaluationDraft {
  evaluatorName: string
  evaluatorPosition: string
  metrics: {
    punctualityAndAttendance: number
    technicalSkills: number
    abilityToLearn: number
    teamworkAndCommunication: number
    initiativeAndProblemSolving: number
  }
  overallScore: number
  strengths: string
  areasForImprovement: string
  wouldHire: boolean
  additionalComments?: string
}

interface EmployerEvaluationFormProps {
    onSuccess: () => void;
    learnerId: string;
    initialData?: EmployerEvaluationDraft | null;
    learnerName?: string;
    placementSummary?: {
      companyName: string;
      institution?: string;
      dueLabel?: string;
      previousVersion?: number | null;
    } | null;
}

const SCORE_LABELS: Record<number, string> = {
  1: "Needs major support",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Strong performance",
  5: "Outstanding",
}

const METRIC_META = {
  punctualityAndAttendance: {
    label: "Punctuality & Attendance",
    description: "Reliability, timekeeping, and consistency on the job.",
  },
  technicalSkills: {
    label: "Technical Skills",
    description: "Ability to apply practical and technical knowledge.",
  },
  abilityToLearn: {
    label: "Ability to Learn",
    description: "How quickly the learner adapts and responds to guidance.",
  },
  teamworkAndCommunication: {
    label: "Teamwork & Communication",
    description: "Collaboration, listening, and professional communication.",
  },
  initiativeAndProblemSolving: {
    label: "Initiative & Problem Solving",
    description: "Ownership, judgment, and response to challenges.",
  },
} as const

export function EmployerEvaluationForm({ onSuccess, learnerId, initialData, learnerName, placementSummary }: EmployerEvaluationFormProps) {
  const [loading, setLoading] = useState(false)
  const { authFetch } = useAuth()

  const form = useForm<EvaluationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      learner: learnerId,
      evaluatorName: initialData?.evaluatorName || "",
      evaluatorPosition: initialData?.evaluatorPosition || "",
      metrics: {
          punctualityAndAttendance: initialData?.metrics.punctualityAndAttendance ?? 3,
          technicalSkills: initialData?.metrics.technicalSkills ?? 3,
          abilityToLearn: initialData?.metrics.abilityToLearn ?? 3,
          teamworkAndCommunication: initialData?.metrics.teamworkAndCommunication ?? 3,
          initiativeAndProblemSolving: initialData?.metrics.initiativeAndProblemSolving ?? 3,
      },
      overallScore: initialData?.overallScore ?? 3,
      strengths: initialData?.strengths || "",
      areasForImprovement: initialData?.areasForImprovement || "",
      wouldHire: initialData?.wouldHire ?? true,
      additionalComments: initialData?.additionalComments || "",
    },
  })

  const metricValues = form.watch("metrics")
  const overallScore = form.watch("overallScore")
  const wouldHire = form.watch("wouldHire")
  const averageMetricScore = useMemo(() => {
    const values = Object.values(metricValues || {})
    if (!values.length) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [metricValues])

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

  const renderMetricScale = (
    name: "metrics.punctualityAndAttendance" | "metrics.technicalSkills" | "metrics.abilityToLearn" | "metrics.teamworkAndCommunication" | "metrics.initiativeAndProblemSolving" | "overallScore",
    label: string,
    description?: string,
  ) => (
      <FormField
          control={form.control}
          name={name}
          render={({ field }) => (
              <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">{label}</FormLabel>
              {description ? <p className="text-xs text-gray-500">{description}</p> : null}
              <FormControl>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((score) => {
                        const selected = field.value === score
                        return (
                          <button
                            key={score}
                            type="button"
                            onClick={() => field.onChange(score)}
                            className={`rounded-xl border px-2 py-3 text-center transition-colors ${
                              selected
                                ? "border-[#FFB800] bg-[#FFB800]/20 text-gray-900"
                                : "border-gray-200 bg-white text-gray-600 hover:border-[#FFB800]/40 hover:text-gray-900"
                            }`}
                          >
                            <div className="text-lg font-black">{score}</div>
                            <div className="text-[10px] font-medium uppercase tracking-wide">Score</div>
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-gray-500">1 = needs support</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-700 border border-gray-200">
                        {SCORE_LABELS[field.value as number] || "Select a score"}
                      </span>
                      <span className="text-xs font-medium text-gray-500">5 = outstanding</span>
                    </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 lg:col-span-2">
            <p className="text-xs font-black uppercase tracking-wider text-amber-700">Evaluation Context</p>
            <p className="mt-2 text-lg font-black text-gray-900">{learnerName || "Selected learner"}</p>
            {placementSummary ? (
              <div className="mt-2 text-sm text-gray-700 space-y-1">
                <p>{placementSummary.companyName}{placementSummary.institution ? ` · ${placementSummary.institution}` : ""}</p>
                {placementSummary.dueLabel ? <p>{placementSummary.dueLabel}</p> : null}
                {placementSummary.previousVersion ? <p>Latest submitted revision: v{placementSummary.previousVersion}</p> : null}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-gray-500">Score Snapshot</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{overallScore}/5</p>
            <p className="text-sm text-gray-600 mt-1">{SCORE_LABELS[overallScore]}</p>
            <p className="text-xs text-gray-500 mt-3">Average across core metrics: {averageMetricScore.toFixed(1)}/5</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField control={form.control} name="evaluatorName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Evaluator Name</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="evaluatorPosition" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Evaluator Position</FormLabel>
                  <FormControl><Input placeholder="HR Manager" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-100">
            <div>
              <h3 className="font-bold text-sm text-gray-900">Core Metrics</h3>
              <p className="text-sm text-gray-500 mt-1">Score each area from 1 to 5 based on observed workplace performance.</p>
            </div>
            {renderMetricScale("metrics.punctualityAndAttendance", METRIC_META.punctualityAndAttendance.label, METRIC_META.punctualityAndAttendance.description)}
            {renderMetricScale("metrics.technicalSkills", METRIC_META.technicalSkills.label, METRIC_META.technicalSkills.description)}
            {renderMetricScale("metrics.abilityToLearn", METRIC_META.abilityToLearn.label, METRIC_META.abilityToLearn.description)}
            {renderMetricScale("metrics.teamworkAndCommunication", METRIC_META.teamworkAndCommunication.label, METRIC_META.teamworkAndCommunication.description)}
            {renderMetricScale("metrics.initiativeAndProblemSolving", METRIC_META.initiativeAndProblemSolving.label, METRIC_META.initiativeAndProblemSolving.description)}
        </div>

        <div className="pt-4 border-t border-gray-100">
            <h3 className="font-bold text-sm text-gray-900 mb-3">Overall Performance</h3>
            {renderMetricScale("overallScore", "Overall Impression", "Use this as your overall placement judgment after considering the full placement experience.")}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">
            <FormField control={form.control} name="strengths" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Key Strengths</FormLabel>
                  <FormControl><Textarea placeholder="What did the learner do well?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="areasForImprovement" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900">Areas for Improvement</FormLabel>
                  <FormControl><Textarea placeholder="What can they improve?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
            )} />
        </div>

        <FormField control={form.control} name="additionalComments" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-gray-900">Additional Comments</FormLabel>
              <FormControl><Textarea placeholder="Any other feedback?" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <FormField control={form.control} name="wouldHire" render={({ field }) => (
            <FormItem className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
              <div className="space-y-1 leading-none mb-3">
                  <FormLabel className="font-semibold text-gray-800 text-sm">Would Hire</FormLabel>
                  <p className="text-xs text-gray-500">Would you consider hiring this learner in the future?</p>
              </div>
              <FormControl>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={`rounded-xl justify-start ${wouldHire ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-600"}`}
                    onClick={() => field.onChange(true)}
                  >
                    Yes, would hire
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`rounded-xl justify-start ${!wouldHire ? "border-red-300 bg-red-50 text-red-800" : "border-gray-200 bg-white text-gray-600"}`}
                    onClick={() => field.onChange(false)}
                  >
                    No, would not hire
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
        )} />

        <Button type="submit" className="w-full bg-[#FFB800] hover:bg-[#e5a600] text-gray-900 font-bold h-12 rounded-xl shadow-sm text-sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {initialData ? "Submit Updated Evaluation" : "Submit Evaluation"}
        </Button>
      </form>
    </Form>
  )
}
