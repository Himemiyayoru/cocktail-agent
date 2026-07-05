import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import Svg, { Defs, ClipPath, Path, Rect, Ellipse, G } from 'react-native-svg';

interface PhysicsBaseline { abv: number; brix: number; opacity: number; color_rgb: number[]; }
interface Component { ingredient_name: string; category: string; volume_ml: number; physics_baseline: PhysicsBaseline; }
interface RecipeDetail { id: number; name: string; method: string; components: Component[]; instructions?: string; glass_type?: string; }

const RY = 0.16;

// 🍸 Advanced Glassware Engine with Custom SVG Icons
const GLASS_SHAPES: Record<string, any> = {
  highball: {
    name: 'Highball', 
    topY: 15, bottomY: 100, rimR: 25, maxVol: 350,
    outline: `M25,15 L25,100 A25,4 0 0,0 75,100 L75,15`, 
    getRadius: (y: number) => 25,
    drawStem: (gl: string) => null,
    drawIcon: (c: string) => <Path d="M30,20 L30,100 A20,4 0 0,0 70,100 L70,20" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" />
  },
  rocks: {
    name: 'Rocks', 
    topY: 45, bottomY: 100, rimR: 30, maxVol: 250,
    outline: `M20,45 L20,100 A30,4.8 0 0,0 80,100 L80,45`,
    getRadius: (y: number) => 30,
    drawStem: (gl: string) => null,
    drawIcon: (c: string) => <Path d="M25,45 L25,100 A25,4 0 0,0 75,100 L75,45" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" />
  },
  martini: {
    name: 'Martini', 
    topY: 15, bottomY: 65, rimR: 40, maxVol: 150,
    outline: `M10,15 L48,65 A2,0.32 0 0,0 52,65 L90,15`,
    getRadius: (y: number) => Math.max(0, 40 - ((y - 15) / 50) * 38),
    drawStem: (gl: string) => (
      <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6">
        <Path d="M48,65 L48,105 Q48,110 30,110" />
        <Path d="M52,65 L52,105 Q52,110 70,110" />
        <Ellipse cx="50" cy="110" rx="20" ry="3.2" fill="rgba(255,255,255,0.05)" />
      </G>
    ),
    drawIcon: (c: string) => <Path d="M10,20 L50,60 L90,20 M50,60 L50,105 M30,105 L70,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  },
  coupe: {
    name: 'Coupe', 
    topY: 15, bottomY: 35, rimR: 35, maxVol: 180,
    outline: `M15,15 L46,35 A4,0.64 0 0,0 54,35 L85,15`,
    getRadius: (y: number) => Math.max(0, 35 - ((y - 15) / 20) * 31),
    drawStem: (gl: string) => (
      <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6">
        <Path d="M48,35 L48,105 Q48,110 30,110" />
        <Path d="M52,35 L52,105 Q52,110 70,110" />
        <Ellipse cx="50" cy="110" rx="20" ry="3.2" fill="rgba(255,255,255,0.05)" />
      </G>
    ),
    drawIcon: (c: string) => <Path d="M15,25 Q50,65 85,25 M50,48 L50,105 M30,105 L70,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  },
  flute: {
    name: 'Flute', 
    topY: 15, bottomY: 75, rimR: 15, maxVol: 180,
    outline: `M35,15 L40,75 A10,1.6 0 0,0 60,75 L65,15`,
    getRadius: (y: number) => Math.max(0, 15 - ((y - 15) / 60) * 5),
    drawStem: (gl: string) => (
      <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6">
        <Path d="M47,76.5 L47,105 Q47,110 35,110" />
        <Path d="M53,76.5 L53,105 Q53,110 65,110" />
        <Ellipse cx="50" cy="110" rx="15" ry="2.4" fill="rgba(255,255,255,0.05)" />
      </G>
    ),
    drawIcon: (c: string) => <Path d="M35,20 L40,70 A10,4 0 0,0 60,70 L65,20 M50,74 L50,105 M35,105 L65,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  },
  nicknora: {
    name: 'Nick&Nora', 
    topY: 20, bottomY: 55, rimR: 30, maxVol: 120,
    outline: `M20,20 L45,55 A5,0.8 0 0,0 55,55 L80,20`,
    getRadius: (y: number) => Math.max(0, 30 - ((y - 20) / 35) * 25),
    drawStem: (gl: string) => (
      <G fill="none" stroke={gl} strokeWidth="1" strokeOpacity="0.6">
        <Path d="M48,55 L48,105 Q48,110 35,110" />
        <Path d="M52,55 L52,105 Q52,110 65,110" />
        <Ellipse cx="50" cy="110" rx="15" ry="2.4" fill="rgba(255,255,255,0.05)" />
      </G>
    ),
    drawIcon: (c: string) => <Path d="M25,30 Q50,75 75,30 M50,55 L50,105 M35,105 L65,105" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  }
};

export default function RecipeLabScreen() {
  const { id } = useLocalSearchParams(); 
  const { colors, isDark } = useTheme(); 
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [initialVolumes, setInitialVolumes] = useState<Record<string, number>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [selectedGlass, setSelectedGlass] = useState<string>('rocks');
  const [isMixedMode, setIsMixedMode] = useState<boolean>(true);

  const gl = isDark ? '255,255,255' : '0,0,0';
  const themeDarken = isDark ? 0 : 40; 
  
  const themePrimary = isDark ? colors.primary : '#111111'; 
  const themePrimaryText = isDark ? '#000000' : '#FFFFFF';

  useEffect(() => { fetchRecipeDetail(); }, [id]);

  const fetchRecipeDetail = async () => {
    try {
      const response = await fetch(`http://192.168.0.237:8000/api/v2/recipes/${id}`);
      const json = await response.json();
      if (json.status === 'success') {
        setRecipe(json.data);
        const initVols: Record<string, number> = {};
        json.data.components.forEach((comp: Component) => {
          initVols[comp.ingredient_name] = comp.volume_ml;
        });
        setInitialVolumes(initVols);
        setVolumes(initVols);
        
        const methodStr = json.data.method?.toLowerCase() || '';
        setIsMixedMode(['shaken', 'stirred', 'blend'].some(m => methodStr.includes(m)));

        const glassHint = json.data.glass_type?.toLowerCase() || '';
        if (glassHint.includes('martini') || glassHint.includes('cocktail')) setSelectedGlass('martini');
        else if (glassHint.includes('highball') || glassHint.includes('collins')) setSelectedGlass('highball');
        else if (glassHint.includes('flute') || glassHint.includes('champagne')) setSelectedGlass('flute');
        else if (glassHint.includes('coupe')) setSelectedGlass('coupe');
        else if (glassHint.includes('nick') || glassHint.includes('nora')) setSelectedGlass('nicknora');
        else setSelectedGlass('rocks');
      }
    } catch (error) {
      console.error("Fetch failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGlassSelect = (glassKey: string) => {
    const newMaxVol = GLASS_SHAPES[glassKey].maxVol;
    const currentTotal = Object.values(volumes).reduce((sum, val) => sum + val, 0);
    
    if (currentTotal > newMaxVol) {
      const ratio = newMaxVol / currentTotal;
      setVolumes(prev => {
        const newVols = { ...prev };
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
        return newVols;
      });
    }
    setSelectedGlass(glassKey);
  };

  const adjustVolume = (ingredientName: string, delta: number) => {
    setVolumes(prev => {
      const currentTotal = Object.values(prev).reduce((sum, val) => sum + val, 0);
      const currentVal = prev[ingredientName] || 0;
      const glassLimit = GLASS_SHAPES[selectedGlass].maxVol;
      
      let newVal = currentVal + delta;
      if (newVal < 0) newVal = 0;
      
      if (delta > 0 && (currentTotal - currentVal + newVal) > glassLimit) {
        newVal = currentVal + (glassLimit - currentTotal);
        if (newVal < currentVal) newVal = currentVal; 
      }
      return { ...prev, [ingredientName]: newVal };
    });
  };

  if (loading || !recipe) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={themePrimary} />
      </View>
    );
  }

  const isMutated = JSON.stringify(initialVolumes) !== JSON.stringify(volumes);

  const calculatePhysics = (targetVolumes: Record<string, number>) => {
    let totalVol = 0; let totalAlc = 0; let totalBrix = 0;
    let absR = 0; let absG = 0; let absB = 0;

    const activeComps = (recipe.components || []).filter(c => (targetVolumes[c.ingredient_name] || 0) > 0);

    activeComps.forEach((comp) => {
      const vol = targetVolumes[comp.ingredient_name] || 0;
      const physics = comp.physics_baseline;
      totalVol += vol;
      totalAlc += vol * (physics.abv || 0); 
      totalBrix += vol * (physics.brix || 0); 

      const rgb = physics.color_rgb || [255,255,255];
      absR += -Math.log10(Math.max(rgb[0], 1) / 255.0) * vol;
      absG += -Math.log10(Math.max(rgb[1], 1) / 255.0) * vol;
      absB += -Math.log10(Math.max(rgb[2], 1) / 255.0) * vol;
    });

    const finalAbv = totalVol > 0 ? (totalAlc / totalVol) * 100 : 0;
    const finalBrix = totalVol > 0 ? (totalBrix / totalVol) : 0;
    const r = totalVol > 0 ? Math.min(Math.max(Math.pow(10, -(absR / totalVol)) * 255, 0), 255) : 0;
    const g = totalVol > 0 ? Math.min(Math.max(Math.pow(10, -(absG / totalVol)) * 255, 0), 255) : 0;
    const b = totalVol > 0 ? Math.min(Math.max(Math.pow(10, -(absB / totalVol)) * 255, 0), 255) : 0;

    return { 
      totalVol, finalAbv, finalBrix, activeComps,
      mixedRGB: [Math.max(0, r - themeDarken), Math.max(0, g - themeDarken), Math.max(0, b - themeDarken)]
    };
  };

  const currentPhysics = calculatePhysics(volumes);

  const CocktailGlassSVG = ({ targetVolumes, title }: { targetVolumes: Record<string, number>, title: string }) => {
    const { totalVol, activeComps, mixedRGB } = calculatePhysics(targetVolumes);
    const glass = GLASS_SHAPES[selectedGlass];
    const fillRatio = Math.min(totalVol / glass.maxVol, 0.95);
    const availableHeight = glass.bottomY - glass.topY;
    
    const renderLiquids = () => {
      if (totalVol === 0) return null;

      if (isMixedMode) {
        const liquidTopY = glass.bottomY - (fillRatio * availableHeight);
        const rxTop = glass.getRadius(liquidTopY);
        
        const bodyColor = `rgba(${mixedRGB[0]},${mixedRGB[1]},${mixedRGB[2]}, 1)`;
        const surfaceColor = `rgba(${Math.min(255, mixedRGB[0]+30)},${Math.min(255, mixedRGB[1]+30)},${Math.min(255, mixedRGB[2]+30)}, 1)`;
        const borderColor = `rgba(${Math.max(0, mixedRGB[0]-60)},${Math.max(0, mixedRGB[1]-60)},${Math.max(0, mixedRGB[2]-60)}, 1)`;

        return (
          <G opacity={0.9}>
            <Rect x="0" y={liquidTopY} width="100" height={(glass.bottomY - liquidTopY) + 10} fill={bodyColor} clipPath="url(#glassClip)" />
            <Ellipse cx="50" cy={liquidTopY} rx={rxTop} ry={rxTop * RY} fill={surfaceColor} stroke={borderColor} strokeWidth="0.5" />
          </G>
        );
      }

      const sortedLayers = [...activeComps].sort((a, b) => {
        const sgA = 1 + (a.physics_baseline.brix * 0.004) - (a.physics_baseline.abv * 0.001);
        const sgB = 1 + (b.physics_baseline.brix * 0.004) - (b.physics_baseline.abv * 0.001);
        return sgB - sgA; 
      });

      let currentY = glass.bottomY;
      
      const layerRenderData = sortedLayers.map((comp, idx) => {
        const vol = targetVolumes[comp.ingredient_name];
        const layerHeight = (vol / glass.maxVol) * availableHeight;
        const layerTopY = currentY - layerHeight;
        const layerBottomY = currentY;
        const isBottomLayer = idx === 0;
        
        const rgb = comp.physics_baseline.color_rgb;
        const r = Math.max(0, rgb[0] - themeDarken);
        const g = Math.max(0, rgb[1] - themeDarken);
        const b = Math.max(0, rgb[2] - themeDarken);

        const bodyColor = `rgba(${r},${g},${b}, 1)`;
        const surfaceColor = `rgba(${Math.min(255, r+30)},${Math.min(255, g+30)},${Math.min(255, b+30)}, 1)`;
        const borderColor = `rgba(${Math.max(0, r-60)},${Math.max(0, g-60)},${Math.max(0, b-60)}, 1)`;
        
        currentY = layerTopY;
        return { idx, layerTopY, layerBottomY, layerHeight, isBottomLayer, bodyColor, surfaceColor, borderColor, rxBot: glass.getRadius(layerBottomY), rxTop: glass.getRadius(layerTopY) };
      });

      const layerElements = [...layerRenderData].map((data) => {
        return (
          <G key={`layer-${data.idx}`} opacity={0.9} clipPath="url(#glassClip)">
            <Rect x="0" y={data.layerTopY} width="100" height={data.layerHeight + (data.isBottomLayer ? 10 : 0)} fill={data.bodyColor} />
            {!data.isBottomLayer && (
               <Ellipse cx="50" cy={data.layerBottomY} rx={data.rxBot} ry={data.rxBot * RY} fill={data.bodyColor} />
            )}
            <Ellipse cx="50" cy={data.layerTopY} rx={data.rxTop} ry={data.rxTop * RY} fill={data.surfaceColor} stroke={data.borderColor} strokeWidth="0.5" />
          </G>
        );
      });

      return <G>{layerElements}</G>;
    };

    return (
      <View style={{ alignItems: 'center', marginHorizontal: 10 }}>
        <Text style={[styles.glassTitle, { color: colors.text }]}>{title}</Text>
        <Svg width="120" height="144" viewBox="0 0 100 120">
          <Defs>
            <ClipPath id="glassClip">
              <Path d={`${glass.outline} L120,-20 L-20,-20 Z`} />
            </ClipPath>
          </Defs>
          
          <Ellipse cx="50" cy={glass.topY} rx={glass.rimR} ry={glass.rimR * RY} fill="none" stroke={`rgba(${gl}, 0.2)`} strokeWidth="0.5" />
          {renderLiquids()}
          <Path d={glass.outline} fill="none" stroke={`rgba(${gl}, 0.5)`} strokeWidth="1" pointerEvents="none" />
          <Ellipse cx="50" cy={glass.topY} rx={glass.rimR} ry={glass.rimR * RY} fill="none" stroke={`rgba(${gl}, 0.7)`} strokeWidth="1.5" />
          {glass.drawStem(`rgba(${gl}, 0.6)`)}
        </Svg>
        <Text style={[styles.glassVolText, { color: totalVol >= glass.maxVol ? '#ff4444' : colors.subtext }]}>
          {Math.round(totalVol)} / {glass.maxVol} ml
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{recipe.name}</Text>
        <Text style={[styles.methodTag, { color: themePrimary }]}>{recipe.method?.toUpperCase()} • {isMixedMode ? 'MIXED' : 'LAYERED'}</Text>
      </View>

      <View style={styles.visualizationSection}>
        {isMutated ? (
          <View style={styles.comparisonContainer}>
            <CocktailGlassSVG targetVolumes={initialVolumes} title="ORIGINAL" />
            <View style={styles.arrowContainer}><Ionicons name="arrow-forward" size={24} color={themePrimary} /></View>
            <CocktailGlassSVG targetVolumes={volumes} title="MUTATED" />
          </View>
        ) : (
          <View style={styles.singleGlassContainer}>
            <CocktailGlassSVG targetVolumes={initialVolumes} title="BASE RECIPE" />
          </View>
        )}
      </View>

      <View style={[styles.physicsPanel, { borderColor: themePrimary, backgroundColor: currentPhysics.totalVol > 0 ? `rgb(${currentPhysics.mixedRGB.join(',')})` : colors.card }]}>
        <Text style={[styles.panelTitle, { color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 }]}>⚡ MIXED FLUID TELEMETRY</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}><Text style={styles.metricLabelLight}>ABV</Text><Text style={styles.metricValueLight}>{currentPhysics.finalAbv.toFixed(1)}%</Text></View>
          <View style={styles.metricBox}><Text style={styles.metricLabelLight}>BRIX</Text><Text style={styles.metricValueLight}>{currentPhysics.finalBrix.toFixed(1)}</Text></View>
          <View style={styles.metricBox}><Text style={styles.metricLabelLight}>VOLUME</Text><Text style={styles.metricValueLight}>{Math.round(currentPhysics.totalVol)}ml</Text></View>
        </View>
      </View>

      {/* 🌟 完美的同一行布局：缩小了内部 Padding 以确保不重叠 */}
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
          {(recipe.components || []).map((comp, index) => {
            const currentVol = volumes[comp.ingredient_name] ?? 0;
            const rgb = comp.physics_baseline.color_rgb;
            
            const isAtMax = currentPhysics.totalVol >= GLASS_SHAPES[selectedGlass].maxVol;
            const plusColor = isAtMax ? '#ff4444' : colors.text;

            return (
              <View key={index} style={[styles.ingredientRow, { borderBottomColor: colors.border }]}>
                <View style={styles.ingredientInfoRow}>
                  <View style={[styles.colorDot, { backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }]} />
                  <View style={styles.ingredientInfo}>
                    <Text style={[styles.ingredientName, { color: colors.text }]}>{comp?.ingredient_name}</Text>
                    <Text style={[styles.ingredientCategory, { color: colors.subtext }]}>{comp?.category}</Text>
                  </View>
                </View>
                <View style={styles.controlsContainer}>
                  <TouchableOpacity onPress={() => adjustVolume(comp.ingredient_name, -5)} style={[styles.controlBtn, { borderColor: colors.border }]}><Ionicons name="remove" size={16} color={colors.text} /></TouchableOpacity>
                  <Text style={[styles.ingredientAmount, { color: themePrimary }]}>{currentVol} ml</Text>
                  <TouchableOpacity onPress={() => adjustVolume(comp.ingredient_name, 5)} style={[styles.controlBtn, { borderColor: isAtMax ? '#ff4444' : colors.border }]}><Ionicons name="add" size={16} color={plusColor} /></TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>🥂 GLASSWARE SELECTION</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.glassSelectorContainer}>
          {Object.entries(GLASS_SHAPES).map(([glassKey, glassData]) => {
            const isSelected = selectedGlass === glassKey;
            const iconColor = isSelected ? themePrimaryText : colors.text;
            return (
              <TouchableOpacity key={glassKey} onPress={() => handleGlassSelect(glassKey)}
                style={[styles.glassBtn, { backgroundColor: isSelected ? themePrimary : colors.card, borderColor: isSelected ? themePrimary : colors.border }]}>
                {/* 🌟 使用纯手工绘制的 SVG 矢量酒杯图标！ */}
                <Svg width="24" height="24" viewBox="0 0 100 120">
                  {glassData.drawIcon(iconColor)}
                </Svg>
                <Text style={[styles.glassBtnText, { color: isSelected ? themePrimaryText : colors.subtext }]}>{glassData.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  errorText: { color: '#ff4444', fontSize: 16 },
  header: { marginBottom: 20, alignItems: 'center' },
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
  metricBox: { alignItems: 'center' },
  metricLabelLight: { fontSize: 10, textTransform: 'uppercase', marginBottom: 4, fontWeight: 'bold', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  metricValueLight: { fontSize: 24, fontWeight: '800', fontFamily: 'monospace', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, borderBottomWidth: 1, paddingBottom: 8, letterSpacing: 1 },
  
  // 🌟 一行完美布局：使用 row，缩小内边距
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
  ingredientCategory: { fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  controlsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  controlBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)' },
  ingredientAmount: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace', minWidth: 45, textAlign: 'center' },

  glassSelectorContainer: { gap: 12, paddingVertical: 8 },
  glassBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 75 },
  glassBtnText: { fontSize: 11, fontWeight: '600', marginTop: 6 },
});