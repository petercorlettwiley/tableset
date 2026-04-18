import type { RecipeSuggestion } from "@/types";

const MOCK_RECIPES: RecipeSuggestion[] = [
  { id: 1, title: "Classic Chocolate Chip Cookies", prepTime: 25, servings: 24, difficulty: "easy", url: "#" },
  { id: 2, title: "Lemon Tart", prepTime: 45, servings: 8, difficulty: "medium", url: "#" },
  { id: 3, title: "Tiramisu", prepTime: 30, servings: 8, difficulty: "medium", url: "#" },
];

export async function getRecipeSuggestions(category: string): Promise<RecipeSuggestion[]> {
  if (process.env.NODE_ENV !== "production" || !process.env.SPOONACULAR_API_KEY) {
    return MOCK_RECIPES;
  }

  const url = `https://api.spoonacular.com/recipes/complexSearch?type=${encodeURIComponent(category)}&number=3&addRecipeInformation=true&apiKey=${process.env.SPOONACULAR_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return MOCK_RECIPES;

  const data = await res.json();
  return data.results.map((r: Record<string, unknown>) => ({
    id: r.id,
    title: r.title,
    prepTime: r.readyInMinutes ?? 30,
    servings: r.servings ?? 4,
    difficulty: (r.readyInMinutes as number) <= 20 ? "easy" : (r.readyInMinutes as number) <= 45 ? "medium" : "hard",
    url: (r.sourceUrl as string) ?? "#",
  }));
}
