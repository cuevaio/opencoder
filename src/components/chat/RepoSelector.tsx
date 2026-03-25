import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { cn } from "#/lib/utils";

interface Repo {
	id: number;
	name: string;
	full_name: string;
	html_url: string;
	description: string | null;
	language: string | null;
	private: boolean;
	archived: boolean;
	default_branch: string;
	updated_at: string | null;
}

// ─── localStorage persistence layer ──────────────────────
const STORAGE_KEY = "github-repos-cache";

function readCache(): Repo[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as Repo[];
	} catch {
		return [];
	}
}

function writeCache(repos: Repo[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
	} catch {
		// Storage quota exceeded — ignore silently
	}
}

// ─── Query options ────────────────────────────────────────

export const reposQueryOptions = {
	queryKey: ["github-repos"],
	queryFn: async (): Promise<Repo[]> => {
		const res = await fetch("/api/github/repos");
		if (!res.ok) throw new Error("Failed to fetch repositories");
		const data = (await res.json()) as { repos: Repo[] };
		// Persist to localStorage for instant load next time
		writeCache(data.repos);
		return data.repos;
	},
	// Show cached data immediately; revalidate in background after 5 min
	staleTime: 5 * 60_000,
	gcTime: 10 * 60_000,
	// Populate initial data from localStorage — renders instantly on mount
	initialData: (): Repo[] => {
		if (typeof window === "undefined") return [];
		return readCache();
	},
	initialDataUpdatedAt: () => {
		// Treat localStorage data as always stale so a background fetch always runs
		return 0;
	},
} as const;

// ─── Component ────────────────────────────────────────────

interface RepoSelectorProps {
	value: string;
	onChange: (url: string) => void;
	disabled?: boolean;
}

export function RepoSelector({
	value,
	onChange,
	disabled = false,
}: RepoSelectorProps) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: repos = [], isFetching, error } = useQuery(reposQueryOptions);

	const filteredRepos = useMemo(
		() =>
			repos
				.filter(
					(r) =>
						!r.archived &&
						r.full_name.toLowerCase().includes(search.toLowerCase()),
				)
				.sort((a, b) => {
					const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
					const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
					return bTime - aTime;
				}),
		[repos, search],
	);

	const selectedRepo = repos.find((r) => r.html_url === value);

	const handleSelect = useCallback(
		(repoUrl: string) => {
			onChange(repoUrl === value ? "" : repoUrl);
			setOpen(false);
			setSearch("");
		},
		[onChange, value],
	);

	const handleSearchChange = useCallback(
		(newSearch: string) => {
			setSearch(newSearch);
			// If user pastes a full GitHub URL, set it directly
			if (/^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+/.test(newSearch)) {
				onChange(newSearch);
			}
		},
		[onChange],
	);

	const handleRefresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ["github-repos"] });
	}, [queryClient]);

	// Show loading spinner only when there's no cached data yet
	const showLoading = isFetching && repos.length === 0;

	return (
		<div>
			<label htmlFor="repo-selector" className="mb-1 block text-sm font-medium">
				Repository
			</label>

			<div className="flex gap-2">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							id="repo-selector"
							variant="outline"
							role="combobox"
							aria-expanded={open}
							disabled={disabled || showLoading}
							className="w-full justify-between font-normal"
						>
							<span className="truncate">
								{selectedRepo
									? selectedRepo.full_name
									: showLoading
										? "Loading repositories..."
										: "Search repos or paste a GitHub URL..."}
							</span>
							<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						className="p-0"
						align="start"
						style={{ width: "var(--radix-popover-trigger-width)" }}
					>
						<Command shouldFilter={false}>
							<CommandInput
								placeholder="Search repos or paste a GitHub URL..."
								value={search}
								onValueChange={handleSearchChange}
							/>
							<CommandList>
								<CommandEmpty>
									{search
										? "No repos match your search"
										: "No repositories found"}
								</CommandEmpty>

								{filteredRepos.length > 0 && (
									<CommandGroup
										heading={
											isFetching ? "Repositories (refreshing…)" : "Repositories"
										}
									>
										{filteredRepos.map((repo) => (
											<CommandItem
												key={repo.id}
												value={repo.html_url}
												onSelect={handleSelect}
											>
												<Check
													className={cn(
														"size-4",
														value === repo.html_url
															? "opacity-100"
															: "opacity-0",
													)}
												/>
												<span className="truncate font-medium">
													{repo.full_name}
												</span>
												{repo.private && (
													<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
														private
													</span>
												)}
												{repo.description && (
													<span className="hidden truncate text-xs text-muted-foreground sm:inline">
														{repo.description}
													</span>
												)}
												{repo.language && (
													<span className="ml-auto shrink-0 text-xs text-muted-foreground">
														{repo.language}
													</span>
												)}
											</CommandItem>
										))}
									</CommandGroup>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>

				<Button
					variant="outline"
					size="icon"
					onClick={handleRefresh}
					disabled={isFetching || disabled}
					title="Refresh repositories"
				>
					<RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
				</Button>
			</div>

			{error && (
				<p className="mt-1 text-xs text-red-500">
					{error instanceof Error
						? error.message
						: "Failed to load repositories"}
				</p>
			)}
		</div>
	);
}
