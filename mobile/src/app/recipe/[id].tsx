import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import Svg, { Defs, ClipPath, Path, Rect, Ellipse, G } from 'react-native-svg';
import { useFavorites } from '../../hooks/useFavorites';
import RealDrinkImage from '../../components/RealDrinkImage';

// API Base URL (Split string to prevent unwanted markdown parsing in some environments)
const API_BASE = 'https://bobs-special-blend.onrender.com';

interface PhysicsBaseline { abv: number; brix: number; opacity: number; color_rgb: number[]; }
interface Component { ingredient_name: string; category: string; volume_ml: number; physics_baseline: PhysicsBaseline; }
interface RecipeDetail { id: number; name: string; method: string; components: Component[]; instructions?: string[]; glass_type?: string; description?: string; }

const RY = 0.16;
const GLASS_SHAPES: Record<string, any> = {
  highball: { name: 'Highball', topY: 15, bottomY: 100, rimR: 25, maxVol: 350, outline: `M25,15 L25,100 A25,4 0 0,0 75,100 L75,15`, getRadius: (y: number) => 25, drawStem: (gl: string) => null, drawIcon: (c: string) => <Path d="M30,20 L30,100 A20,4 0 0,0 70,100 L70,20" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" /> },
  rocks: { name: 'Rocks', topY: 45, bottomY: 100, rimR: 30, maxVol: 250, outline: `M20,45 L20,100 A30,4.8 0 0,0 80,100 L80,45`, getRadius: (y: number) => 30, drawStem: (gl: string) => null, drawIcon: (c: string) => <Path d="M25,45 L25,100 A25,4 0 0,0 75,100 L75,45" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" /> },
  martini: { name: 'Martini', topY: 15, bottomY: 65, rimR: 40, maxVol: 150, outline: `M10,15 L48,65 A2,0.32 0 0,0 52,65 L90,15`, getRadius: (y: number) => Math.max(0, 40 - ((y - 15) / 50) * 38), drawStem: (gl: string) => <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6"><Path d="M48,65 L48,105 Q48,110 30,110" /><Path d="M52,65 L52,105 Q52,110 70,110" /><Ellipse cx="50" cy="110" rx="20" ry="3.2" fill="rgba(255,255,255,0.05)" /></G>, drawIcon: (c: string) => <Path d="M10,20 L50,60 L90,20 M50,60 L50,105 M30,105 L70,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /> },
  coupe: { name: 'Coupe', topY: 15, bottomY: 35, rimR: 35, maxVol: 180, outline: `M15,15 A31,20 0 0 0 46,35 A4,0.64 0 0 0 54,35 A31,20 0 0 0 85,15`, getRadius: (y: number) => { const t = Math.min(Math.max((y - 15) / 20, 0), 1); return 4 + 31 * Math.sqrt(1 - t * t); }, drawStem: (gl: string) => <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6"><Path d="M48,35 L48,105 Q48,110 30,110" /><Path d="M52,35 L52,105 Q52,110 70,110" /><Ellipse cx="50" cy="110" rx="20" ry="3.2" fill="rgba(255,255,255,0.05)" /></G>, drawIcon: (c: string) => <Path d="M12,25 C12,65 88,65 88,25 M50,52 L50,105 M30,105 L70,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /> },
  flute: { name: 'Flute', topY: 15, bottomY: 75, rimR: 15, maxVol: 180, outline: `M35,15 L40,75 A10,1.6 0 0,0 60,75 L65,15`, getRadius: (y: number) => Math.max(0, 15 - ((y - 15) / 60) * 5), drawStem: (gl: string) => <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6"><Path d="M47,76.5 L47,105 Q47,110 35,110" /><Path d="M53,76.5 L53,105 Q53,110 65,110" /><Ellipse cx="50" cy="110" rx="15" ry="2.4" fill="rgba(255,255,255,0.05)" /></G>, drawIcon: (c: string) => <Path d="M35,20 L40,70 A10,4 0 0,0 60,70 L65,20 M50,74 L50,105 M35,105 L65,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /> },
  nicknora: { name: 'Nick&Nora', topY: 20, bottomY: 55, rimR: 30, maxVol: 120, outline: `M20,20 A25,35 0 0 0 45,55 A5,0.8 0 0 0 55,55 A25,35 0 0 0 80,20`, getRadius: (y: number) => { const t = Math.min(Math.max((y - 20) / 35, 0), 1); return 5 + 25 * Math.sqrt(1 - t * t); }, drawStem: (gl: string) => <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6"><Path d="M48,55 L48,105 Q48,110 35,110" /><Path d="M52,55 L52,105 Q52,110 65,110" /><Ellipse cx="50" cy="110" rx="15" ry="2.4" fill="rgba(255,255,255,0.05)" /></G>, drawIcon: (c: string) => <Path d="M25,20 C25,75 75,75 75,20 M50,62 L50,105 M30,105 L70,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /> },
  shot: { name: 'Shot', topY: 50, bottomY: 90, rimR: 20, maxVol: 50, outline: `M30,50 L35,90 A15,3 0 0,0 65,90 L70,50`, getRadius: (y: number) => 20 - ((y - 50) / 40) * 5, drawStem: (gl: string) => <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.8"><Path d="M35,90 L37,110 A13,2.5 0 0,0 63,110 L65,90" /></G>, drawIcon: (c: string) => <Path d="M35,40 L40,90 M65,40 L60,90 M40,90 L60,90 M40,90 L42,105 L58,105 L60,90" fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> }
};

export default function RecipeLabScreen() {
  const { id } = useLocalSearchParams(); 
  const router = useRouter(); 
  const { favorites, toggleFavorite } = useFavorites();
  const isFavorite = favorites.includes(Number(id));
  const { colors, isDark } = useTheme(); 
  
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'photo' | 'physics'>('photo');

  const [originalComponents, setOriginalComponents] = useState<Component[]>([]);
  const [components, setComponents] = useState<Component[]>([]);

  const [initialVolumes, setInitialVolumes] = useState<Record<string, number>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [baseVolumes, setBaseVolumes] = useState<Record<string, number> | null>(null);
  
  const [initialGlass, setInitialGlass] = useState<string>('rocks');
  const [selectedGlass, setSelectedGlass] = useState<string>('rocks');
  const [isMixedMode, setIsMixedMode] = useState<boolean>(true);

  // Track the index of the slot being modified, rather than the name, to handle duplicate ingredients or precision swaps
  const [showSubModal, setShowSubModal] = useState(false);
  const [subTargetIndex, setSubTargetIndex] = useState<number | null>(null);
  const [subCandidates, setSubCandidates] = useState<any[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const gl = isDark ? '255,255,255' : '0,0,0';
  const themeDarken = isDark ? 0 : 40; 
  const themePrimary = isDark ? colors.primary : '#111111'; 
  const themePrimaryText = isDark ? '#000000' : '#FFFFFF';

  useEffect(() => { fetchRecipeDetail(); }, [id]);

  const fetchRecipeDetail = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v2/recipes/${id}`);
      const json = await response.json();
      if (json.status === 'success') {
        setRecipe(json.data);
        setOriginalComponents(json.data.components);
        setComponents(json.data.components);
        
        let initVols: Record<string, number> = {};
        json.data.components.forEach((comp: Component) => {
          initVols[comp.ingredient_name] = comp.volume_ml;
        });

        const methodStr = json.data.method?.toLowerCase() || '';
        setIsMixedMode(['shaken', 'stirred', 'blend'].some(m => methodStr.includes(m)));

        let initialG = 'rocks';
        const glassHint = json.data.glass_type?.toLowerCase() || '';
        if (glassHint.includes('martini') || glassHint.includes('cocktail')) initialG = 'martini';
        else if (glassHint.includes('highball') || glassHint.includes('collins')) initialG = 'highball';
        else if (glassHint.includes('flute') || glassHint.includes('champagne')) initialG = 'flute';
        else if (glassHint.includes('coupe')) initialG = 'coupe';
        else if (glassHint.includes('nick') || glassHint.includes('nora')) initialG = 'nicknora';
        else if (glassHint.includes('shot')) initialG = 'shot';
        else if (glassHint.includes('hurricane') || glassHint.includes('poco')) initialG = 'highball';
        if (!GLASS_SHAPES[initialG]) initialG = 'rocks';

        const newMaxVol = GLASS_SHAPES[initialG].maxVol;
        const currentBaseTotal = Object.values(initVols).reduce((sum, val) => sum + val, 0);
        
        if (currentBaseTotal > newMaxVol) {
          const ratio = (newMaxVol * 0.95) / currentBaseTotal;
          for (const k in initVols) {
            if (initVols[k] > 0) {
              let snapped = Math.round((initVols[k] * ratio) / 5) * 5;
              if (snapped === 0) snapped = 5; 
              initVols[k] = snapped;
            }
          }
        }

        setInitialVolumes(initVols);
        setVolumes(initVols);
        setBaseVolumes(null); 
        setInitialGlass(initialG);
        setSelectedGlass(initialG);
      }
    } catch (error) { console.error("Fetch failed:", error); } 
    finally { setLoading(false); }
  };

  const handleGlassSelect = (glassKey: string) => {
    setViewMode('physics'); 
    const newMaxVol = GLASS_SHAPES[glassKey].maxVol;
    const currentBase = baseVolumes || volumes; 
    const currentBaseTotal = Object.values(currentBase).reduce((sum, val) => sum + val, 0);
    
    if (currentBaseTotal > newMaxVol) {
      if (!baseVolumes) setBaseVolumes(volumes);
      const ratio = newMaxVol / currentBaseTotal;
      const newVols = { ...currentBase };
      let newTotal = 0;
      for (const k in newVols) {
        if (newVols[k] > 0) {
          let snapped = Math.round((newVols[k] * ratio) / 5) * 5;
          if (snapped === 0) snapped = 5; 
          newVols[k] = snapped;
          newTotal += snapped;
        }
      }
      while (newTotal > newMaxVol) {
        const largestKey = Object.keys(newVols).reduce((a, b) => newVols[a] > newVols[b] ? a : b);
        newVols[largestKey] -= 5;
        newTotal -= 5;
      }
      setVolumes(newVols);
    } else {
      if (baseVolumes) { setVolumes(baseVolumes); setBaseVolumes(null); }
    }
    setSelectedGlass(glassKey);
  };

  const adjustVolume = (ingredientName: string, delta: number) => {
    setViewMode('physics'); 
    setBaseVolumes(null); 
    setVolumes(prev => {
      const currentTotal = Object.values(prev).reduce((sum, val) => sum + val, 0);
      const currentVal = prev[ingredientName] || 0;
      const currentGlassLimit = (GLASS_SHAPES[selectedGlass] || GLASS_SHAPES['rocks']).maxVol;
      let newVal = currentVal + delta;
      if (newVal < 0) newVal = 0;
      if (delta > 0 && (currentTotal - currentVal + newVal) > currentGlassLimit) {
        newVal = currentVal + (currentGlassLimit - currentTotal);
        if (newVal < currentVal) newVal = currentVal; 
      }
      return { ...prev, [ingredientName]: newVal };
    });
  };

  // Advanced substitution logic: Detects prior substitutions and pins the original ingredient to the top
  const openSubstituteModal = async (index: number) => {
    setSubTargetIndex(index);
    const currentName = components[index].ingredient_name;
    const originalName = originalComponents[index].ingredient_name;

    setShowSubModal(true);
    setLoadingSubs(true);
    try {
      const res = await fetch(`${API_BASE}/api/v2/substitute?ingredient=${encodeURIComponent(currentName)}`);
      const json = await res.json();
      if (json.status === 'success') {
        let cands = json.substitutes;
        
        if (currentName !== originalName) {
          cands = cands.filter((c: any) => c.ingredient_name !== originalName);
          cands.unshift({
            ingredient_name: originalName,
            match_score: 'ORIGINAL',
            isOriginal: true,
            physics_baseline: originalComponents[index].physics_baseline
          });
        }
        setSubCandidates(cands);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSubs(false);
    }
  };

  const performSubstitute = (candidate: any) => {
    if (subTargetIndex === null) return;
    setViewMode('physics'); 
    
    const oldName = components[subTargetIndex].ingredient_name;
    const newName = candidate.ingredient_name;

    setComponents(prev => {
      const newComps = [...prev];
      newComps[subTargetIndex] = { ...newComps[subTargetIndex], ingredient_name: newName, physics_baseline: candidate.physics_baseline };
      return newComps;
    });

    // Transfer volume to the new ingredient
    setVolumes(prev => {
      const newVols = { ...prev };
      const oldVol = newVols[oldName] || 0;
      delete newVols[oldName];
      newVols[newName] = oldVol;
      return newVols;
    });

    setShowSubModal(false);
  };

  if (loading || !recipe) return <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={themePrimary} /></View>;

  const isMutated = JSON.stringify(initialVolumes) !== JSON.stringify(volumes) || 
                    initialGlass !== selectedGlass ||
                    JSON.stringify(originalComponents) !== JSON.stringify(components);

  const calculatePhysics = (targetVolumes: Record<string, number>, useOriginal: boolean = false) => {
    let totalVol = 0; let totalAlc = 0; let totalBrix = 0; let absR = 0; let absG = 0; let absB = 0; let totalOpacity = 0;
    
    const activeList = useOriginal ? originalComponents : components;
    const activeComps = activeList.filter(c => {
      // Fallback: When calculating original physics, retrieve the volume using the original ingredient name
      const vol = useOriginal ? (initialVolumes[c.ingredient_name] || 0) : (targetVolumes[c.ingredient_name] || 0);
      return vol > 0;
    });

    activeComps.forEach((comp) => {
      const vol = useOriginal ? (initialVolumes[comp.ingredient_name] || 0) : (targetVolumes[comp.ingredient_name] || 0);
      const physics = comp.physics_baseline;
      totalVol += vol;
      totalAlc += vol * (physics.abv || 0); 
      totalBrix += vol * (physics.brix || 0); 
      totalOpacity += vol * (physics.opacity || 0);
      const rgb = physics.color_rgb || [255,255,255];
      absR += -Math.log10(Math.max(rgb[0], 1) / 255.0) * vol;
      absG += -Math.log10(Math.max(rgb[1], 1) / 255.0) * vol;
      absB += -Math.log10(Math.max(rgb[2], 1) / 255.0) * vol;
    });

    const finalAbv = totalVol > 0 ? (totalAlc / totalVol) : 0;
    const finalBrix = totalVol > 0 ? (totalBrix / totalVol) : 0;
    const finalOpacity = totalVol > 0 ? (totalOpacity / totalVol) : 0;
    const r = totalVol > 0 ? Math.round(Math.min(Math.max(Math.pow(10, -(absR / totalVol)) * 255, 0), 255)) : 0;
    const g = totalVol > 0 ? Math.round(Math.min(Math.max(Math.pow(10, -(absG / totalVol)) * 255, 0), 255)) : 0;
    const b = totalVol > 0 ? Math.round(Math.min(Math.max(Math.pow(10, -(absB / totalVol)) * 255, 0), 255)) : 0;

    return { 
      totalVol, finalAbv, finalBrix, activeComps, finalOpacity,
      mixedRGB: [ Math.round(Math.max(0, r - themeDarken)), Math.round(Math.max(0, g - themeDarken)), Math.round(Math.max(0, b - themeDarken)) ]
    };
  };

  // Maintain two independent physics states for comparison
  const originalPhysics = calculatePhysics(initialVolumes, true);
  const currentPhysics = calculatePhysics(volumes, false);

  // Render colored directional arrows for stat differences
  const renderArrow = (current: number, original: number, unit: string = '') => {
    const diff = current - original;
    if (Math.abs(diff) < 0.1) return null;
    const isUp = diff > 0;
    return (
      <Text style={{ color: isUp ? '#4caf50' : '#ff4444', fontSize: 12, fontWeight: '900', marginLeft: 4 }}>
        {isUp ? '↑' : '↓'}{Math.abs(diff).toFixed(1)}{unit}
      </Text>
    );
  };

  // Generate flavor impact analysis based on recipe mutations
  const getMutationImpact = () => {
    const swaps: string[] = [];
    components.forEach((c, i) => {
      if (c.ingredient_name !== originalComponents[i].ingredient_name) {
        swaps.push(`${originalComponents[i].ingredient_name} ➔ ${c.ingredient_name}`);
      }
    });
    
    // Only display the impact module if ingredients were substituted
    if (swaps.length === 0) return null;

    const abvDiff = currentPhysics.finalAbv - originalPhysics.finalAbv;
    const brixDiff = currentPhysics.finalBrix - originalPhysics.finalBrix;
    
    const notes: string[] = [];
    if (abvDiff > 1.5) notes.push("🔥 Packs a notably stronger punch (+ABV).");
    else if (abvDiff < -1.5) notes.push("🧊 Milder and less boozy (-ABV).");
    
    if (brixDiff > 1.0) notes.push("🍬 Noticeably sweeter profile (+BRIX).");
    else if (brixDiff < -1.0) notes.push("🍋 Drier, less sweet finish (-BRIX).");

    if (notes.length === 0) notes.push("⚖️ Very similar flavor and balance to the original.");

    return { swaps, notes };
  };

  const mutationImpact = getMutationImpact();

  const CocktailGlassSVG = ({ targetVolumes, title, glassKey, useOriginal }: { targetVolumes: Record<string, number>, title: string, glassKey: string, useOriginal: boolean }) => {
    const { totalVol, activeComps, mixedRGB, finalOpacity } = calculatePhysics(targetVolumes, useOriginal);
    const glass = GLASS_SHAPES[glassKey] || GLASS_SHAPES['rocks'];
    const fillRatio = Math.min(totalVol / glass.maxVol, 0.95);
    const availableHeight = glass.bottomY - glass.topY;
    
    const renderLiquids = () => {
      if (totalVol === 0) return null;
      if (isMixedMode) {
        const liquidTopY = glass.bottomY - (fillRatio * availableHeight);
        const rxTop = glass.getRadius(liquidTopY);
        const alpha = 0.4 + (finalOpacity * 0.55);
        const solidBodyColor = `rgb(${mixedRGB[0]},${mixedRGB[1]},${mixedRGB[2]})`;
        const solidSurfaceColor = `rgb(${Math.min(255, mixedRGB[0]+30)},${Math.min(255, mixedRGB[1]+30)},${Math.min(255, mixedRGB[2]+30)})`;
        const solidBorderColor = `rgb(${Math.max(0, mixedRGB[0]-60)},${Math.max(0, mixedRGB[1]-60)},${Math.max(0, mixedRGB[2]-60)})`;

        return (
          <G opacity={alpha}>
            <G clipPath="url(#glassClip)"><Rect x="0" y={liquidTopY} width="100" height={(glass.bottomY - liquidTopY) + 10} fill={solidBodyColor} /></G>
            <Ellipse cx="50" cy={liquidTopY} rx={rxTop} ry={rxTop * RY} fill={solidSurfaceColor} stroke={solidBorderColor} strokeWidth="0.5" />
          </G>
        );
      }

      const sortedLayers = [...activeComps].sort((a, b) => {
        const sgA = 1 + (a.physics_baseline.brix * 0.004) - (a.physics_baseline.abv * 0.001);
        const sgB = 1 + (b.physics_baseline.brix * 0.004) - (b.physics_baseline.abv * 0.001);
        return sgB - sgA; 
      });

      let currentY = glass.bottomY;
      const safeTotalVol = Math.min(totalVol, glass.maxVol * 0.95);
      const volScale = totalVol > 0 ? safeTotalVol / totalVol : 1;

      return (
        <G>
          {sortedLayers.map((comp, idx) => {
            const vol = targetVolumes[comp.ingredient_name] * volScale; 
            const layerHeight = (vol / glass.maxVol) * availableHeight;
            const layerTopY = currentY - layerHeight;
            const layerBottomY = currentY;
            const isBottomLayer = idx === 0;
            const rgb = comp.physics_baseline.color_rgb;
            const r = Math.round(Math.max(0, rgb[0] - themeDarken));
            const g = Math.round(Math.max(0, rgb[1] - themeDarken));
            const b = Math.round(Math.max(0, rgb[2] - themeDarken));
            const op = comp.physics_baseline.opacity ?? 0;
            const alpha = 0.4 + (op * 0.55);
            const solidBodyColor = `rgb(${r},${g},${b})`;
            const solidSurfaceColor = `rgb(${Math.min(255, r+30)},${Math.min(255, g+30)},${Math.min(255, b+30)})`;
            const solidBorderColor = `rgb(${Math.max(0, r-60)},${Math.max(0, g-60)},${Math.max(0, b-60)})`;
            currentY = layerTopY;
            return (
              <G key={`layer-${idx}`} opacity={alpha}>
                <G clipPath="url(#glassClip)">
                  <Rect x="0" y={layerTopY} width="100" height={layerHeight + (isBottomLayer ? 10 : 0)} fill={solidBodyColor} />
                  {!isBottomLayer && <Ellipse cx="50" cy={layerBottomY} rx={glass.getRadius(layerBottomY)} ry={glass.getRadius(layerBottomY) * RY} fill={solidBodyColor} />}
                </G>
                <Ellipse cx="50" cy={layerTopY} rx={glass.getRadius(layerTopY)} ry={glass.getRadius(layerTopY) * RY} fill={solidSurfaceColor} stroke={solidBorderColor} strokeWidth="0.5" />
              </G>
            );
          })}
        </G>
      );
    };

    return (
      <View style={{ alignItems: 'center', marginHorizontal: 10 }}>
        <Text style={[styles.glassTitle, { color: colors.text }]}>{title}</Text>
        <Svg width="120" height="144" viewBox="0 0 100 120">
          <Defs><ClipPath id="glassClip"><Path d={`${glass.outline} L120,-20 L-20,-20 Z`} /></ClipPath></Defs>
          <Ellipse cx="50" cy={glass.topY} rx={glass.rimR} ry={glass.rimR * RY} fill="none" stroke={`rgba(${gl}, 0.2)`} strokeWidth="0.5" />
          {renderLiquids()}
          <Path d={glass.outline} fill="none" stroke={`rgba(${gl}, 0.5)`} strokeWidth="1" pointerEvents="none" />
          <Ellipse cx="50" cy={glass.topY} rx={glass.rimR} ry={glass.rimR * RY} fill="none" stroke={`rgba(${gl}, 0.7)`} strokeWidth="1.5" />
          {glass.drawStem(`rgba(${gl}, 0.6)`)}
        </Svg>
        <Text style={[styles.glassVolText, { color: totalVol >= glass.maxVol ? '#ff4444' : colors.subtext }]}>{Math.round(totalVol)} / {glass.maxVol} ml</Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.topNav}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleFavorite(Number(id))} style={{ padding: 4 }}>
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={28} color={isFavorite ? "#FF3B30" : colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{recipe.name}</Text>
          <Text style={[styles.methodTag, { color: themePrimary }]}>{recipe.method?.toUpperCase()} • {isMixedMode ? 'MIXED' : 'LAYERED'}</Text>
        </View>

        <View style={{ alignItems: 'center', marginBottom: 15 }}>
          <View style={[styles.toggleContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => setViewMode('photo')} style={[styles.toggleOption, { backgroundColor: viewMode === 'photo' ? themePrimary : 'transparent' }]}>
              <Text style={[styles.toggleText, { color: viewMode === 'photo' ? themePrimaryText : colors.subtext }]}>📸 PHOTO</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('physics')} style={[styles.toggleOption, { backgroundColor: viewMode === 'physics' ? themePrimary : 'transparent' }]}>
              <Text style={[styles.toggleText, { color: viewMode === 'physics' ? themePrimaryText : colors.subtext }]}>📐 PHYSICS</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.visualizationSection}>
          {viewMode === 'photo' ? (
            <View style={styles.singleGlassContainer}>
              {/* Utilize the globally shared RealDrinkImage component */}
              <RealDrinkImage drinkName={recipe.name} size={180} />
            </View>
          ) : (
            isMutated ? (
              <View style={styles.comparisonContainer}>
                <CocktailGlassSVG targetVolumes={initialVolumes} title="ORIGINAL" glassKey={initialGlass} useOriginal={true} />
                <View style={styles.arrowContainer}><Ionicons name="arrow-forward" size={24} color={themePrimary} /></View>
                <CocktailGlassSVG targetVolumes={volumes} title="MUTATED" glassKey={selectedGlass} useOriginal={false} />
              </View>
            ) : (
              <View style={styles.singleGlassContainer}>
                <CocktailGlassSVG targetVolumes={initialVolumes} title="BASE RECIPE" glassKey={initialGlass} useOriginal={true} />
              </View>
            )
          )}
        </View>

        {/* Mixed Fluid Telemetry Panel with dynamic physics indicators */}
        <View style={[styles.physicsPanel, { borderColor: themePrimary, backgroundColor: currentPhysics.totalVol > 0 ? `rgb(${currentPhysics.mixedRGB.join(',')})` : colors.card }]}>
          <Text style={[styles.panelTitle, { color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 }]}>⚡ MIXED FLUID TELEMETRY</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabelLight}>ABV</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.metricValueLight}>{currentPhysics.finalAbv.toFixed(1)}%</Text>
                {renderArrow(currentPhysics.finalAbv, originalPhysics.finalAbv)}
              </View>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabelLight}>BRIX</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.metricValueLight}>{currentPhysics.finalBrix.toFixed(1)}</Text>
                {renderArrow(currentPhysics.finalBrix, originalPhysics.finalBrix)}
              </View>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabelLight}>VOLUME</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.metricValueLight}>{Math.round(currentPhysics.totalVol)}ml</Text>
                {renderArrow(currentPhysics.totalVol, originalPhysics.totalVol)}
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.toggleSection]}>
          <Text style={[styles.sectionTitle, { color: colors.text, borderBottomWidth: 0, marginBottom: 0 }]}>🔄 STATE</Text>
          <View style={[styles.toggleContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => setIsMixedMode(true)} style={[styles.toggleOption, { backgroundColor: isMixedMode ? themePrimary : 'transparent' }]}>
              <Text style={[styles.toggleText, { color: isMixedMode ? themePrimaryText : colors.subtext }]}>MIXED</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsMixedMode(false)} style={[styles.toggleOption, { backgroundColor: !isMixedMode ? themePrimary : 'transparent' }]}>
              <Text style={[styles.toggleText, { color: !isMixedMode ? themePrimaryText : colors.subtext }]}>LAYERED</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>🎛️ INGREDIENT CONTROLS</Text>
          <View style={[styles.ingredientsList, { backgroundColor: colors.card }]}>
            
            {components.map((comp, index) => {
              const currentVol = volumes[comp.ingredient_name] ?? 0;
              const origName = originalComponents[index].ingredient_name;
              const initVol = initialVolumes[origName] || 0;
              
              // Precise diff tracking: Compare current volume against the original precursor ingredient
              const diff = currentVol - initVol;
              const isSubstituted = comp.ingredient_name !== origName;

              const rgb = comp.physics_baseline.color_rgb;
              const currentGlassLimit = (GLASS_SHAPES[selectedGlass] || GLASS_SHAPES['rocks']).maxVol;
              const isAtMax = currentPhysics.totalVol >= currentGlassLimit;
              
              return (
                <View key={index} style={[styles.ingredientRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.ingredientInfoRow}>
                    <View style={[styles.colorDot, { backgroundColor: `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})` }]} />
                    <View style={styles.ingredientInfo}>
                      <Text style={[styles.ingredientName, { color: isSubstituted ? themePrimary : colors.text }]}>
                        {comp.ingredient_name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={[styles.ingredientCategory, { color: colors.subtext }]}>{comp.category}</Text>
                        
                        {/* Trigger substitution modal using index to maintain exact position */}
                        <TouchableOpacity onPress={() => openSubstituteModal(index)} style={styles.swapBtnTextWrapper}>
                          <Ionicons name="swap-horizontal" size={12} color={themePrimary} />
                          <Text style={{ fontSize: 10, color: themePrimary, fontWeight: 'bold', marginLeft: 2 }}>SWAP</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.controlsContainer}>
                    <TouchableOpacity onPress={() => adjustVolume(comp.ingredient_name, -5)} style={[styles.controlBtn, { borderColor: colors.border }]}><Ionicons name="remove" size={16} color={colors.text} /></TouchableOpacity>
                    <View style={styles.volDisplayWrapper}>
                      {diff !== 0 && (
                        <Text style={[styles.diffIndicator, { color: diff > 0 ? '#4caf50' : '#ff4444' }]}>
                          {isSubstituted && diff === 0 ? 'SWAP' : (diff > 0 ? `↑+${diff}` : `↓${diff}`)}
                        </Text>
                      )}
                      <Text style={[styles.ingredientAmount, { color: themePrimary }]}>{currentVol} ml</Text>
                    </View>
                    <TouchableOpacity onPress={() => adjustVolume(comp.ingredient_name, 5)} style={[styles.controlBtn, { borderColor: isAtMax ? '#ff4444' : colors.border }]}><Ionicons name="add" size={16} color={isAtMax ? '#ff4444' : colors.text} /></TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Dynamic Flavor Impact Module (visible only upon recipe mutation) */}
        {mutationImpact && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>🧬 MUTATION IMPACT</Text>
            <View style={[styles.impactContainer, { backgroundColor: isDark ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)', borderColor: '#FF9500' }]}>
              {mutationImpact.swaps.map((s, i) => (
                 <Text key={i} style={[styles.impactSwapText, { color: colors.text }]}>• {s}</Text>
              ))}
              <View style={{ height: 1, backgroundColor: 'rgba(255,149,0,0.3)', marginVertical: 12 }} />
              {mutationImpact.notes.map((n, i) => (
                 <Text key={i} style={styles.impactNoteText}>{n}</Text>
              ))}
            </View>
          </View>
        )}

        {recipe.instructions && Array.isArray(recipe.instructions) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>📝 MIXING INSTRUCTIONS</Text>
            <View style={[styles.instructionsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {recipe.instructions.map((step, index) => (
                <View key={index} style={styles.instructionRow}>
                  <View style={[styles.stepNumberBadge, { backgroundColor: themePrimary }]}><Text style={[styles.stepNumberText, { color: themePrimaryText }]}>{index + 1}</Text></View>
                  <Text style={[styles.instructionText, { color: colors.text }]}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>🥂 GLASSWARE SELECTION</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.glassSelectorContainer}>
            {Object.entries(GLASS_SHAPES).map(([glassKey, glassData]) => {
              const isSelected = selectedGlass === glassKey;
              return (
                <TouchableOpacity key={glassKey} onPress={() => handleGlassSelect(glassKey)} style={[styles.glassBtn, { backgroundColor: isSelected ? themePrimary : colors.card, borderColor: isSelected ? themePrimary : colors.border }]}>
                  <Svg width="24" height="24" viewBox="0 0 100 120">{glassData.drawIcon(isSelected ? themePrimaryText : colors.text)}</Svg>
                  <Text style={[styles.glassBtnText, { color: isSelected ? themePrimaryText : colors.subtext }]}>{glassData.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

      </ScrollView>

      {/* Substitution Modal: Highlights the original ingredient for easy reversion */}
      <Modal visible={showSubModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>AI SUBSTITUTION</Text>
                {subTargetIndex !== null && <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>Finding physics match for {components[subTargetIndex].ingredient_name}...</Text>}
              </View>
              <TouchableOpacity onPress={() => setShowSubModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingSubs ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                 <ActivityIndicator size="large" color={themePrimary} />
                 <Text style={{ color: themePrimary, marginTop: 10, fontWeight: 'bold' }}>Calculating Euclidean Distance...</Text>
              </View>
            ) : subCandidates.length === 0 ? (
              <Text style={{ color: colors.subtext, textAlign: 'center', padding: 20 }}>No good substitutes found in database.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                {subCandidates.map((cand, idx) => {
                  const isOrig = cand.isOriginal;
                  return (
                    <TouchableOpacity 
                      key={idx} 
                      style={[styles.candCard, { backgroundColor: isOrig ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : colors.card, borderColor: isOrig ? themePrimary : colors.border }]} 
                      onPress={() => performSubstitute(cand)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={[styles.colorDot, { width: 16, height: 16, borderRadius: 8, backgroundColor: `rgb(${cand.physics_baseline.color_rgb.join(',')})` }]} />
                        <View>
                          <Text style={{ color: isOrig ? themePrimary : colors.text, fontWeight: '900', fontSize: 16 }}>{cand.ingredient_name}</Text>
                          <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{cand.physics_baseline.abv}% ABV • {cand.physics_baseline.brix} BRIX</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: isOrig ? themePrimary : colors.text, fontWeight: '900', fontSize: 16 }}>{cand.match_score}</Text>
                        {!isOrig && <Text style={{ color: colors.subtext, fontSize: 8, fontWeight: 'bold' }}>MATCH</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 10 },
  backButton: { marginLeft: -8, padding: 4 },
  header: { marginBottom: 15, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  methodTag: { fontSize: 12, marginTop: 4, letterSpacing: 2, fontWeight: 'bold' },
  visualizationSection: { marginBottom: 24, minHeight: 220, justifyContent: 'center' },
  singleGlassContainer: { alignItems: 'center' },
  comparisonContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  arrowContainer: { paddingHorizontal: 5 },
  glassTitle: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, fontFamily: 'monospace' },
  glassVolText: { fontSize: 10, marginTop: 8, fontFamily: 'monospace', fontWeight: 'bold' },
  physicsPanel: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 24, overflow: 'hidden' },
  panelTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 16, letterSpacing: 1 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricBox: { alignItems: 'center', flexDirection: 'column' },
  metricLabelLight: { fontSize: 10, textTransform: 'uppercase', marginBottom: 4, fontWeight: 'bold', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  metricValueLight: { fontSize: 24, fontWeight: '800', fontFamily: 'monospace', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, borderBottomWidth: 1, paddingBottom: 8, letterSpacing: 1 },
  toggleSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleContainer: { flexDirection: 'row', borderRadius: 50, borderWidth: 1, padding: 3, overflow: 'hidden' }, 
  toggleOption: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 50 }, 
  toggleText: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  ingredientsList: { borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  ingredientInfoRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  ingredientInfo: { flex: 1 },
  ingredientName: { fontSize: 16, fontWeight: '600' },
  ingredientCategory: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  swapBtnTextWrapper: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  controlsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  controlBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)' },
  volDisplayWrapper: { alignItems: 'center', justifyContent: 'center', minWidth: 45, position: 'relative' },
  diffIndicator: { position: 'absolute', top: -14, fontSize: 10, fontWeight: '900', fontFamily: 'monospace' },
  ingredientAmount: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace', textAlign: 'center' },
  
  impactContainer: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 4 },
  impactSwapText: { fontSize: 14, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  impactNoteText: { fontSize: 14, fontWeight: '600', color: '#FF9500', marginTop: 4, lineHeight: 22 },

  glassSelectorContainer: { gap: 12, paddingVertical: 8 },
  glassBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 75 },
  glassBtnText: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  instructionsContainer: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 16 },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNumberBadge: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  stepNumberText: { fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' },
  instructionText: { fontSize: 15, lineHeight: 24, flex: 1, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  candCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
});