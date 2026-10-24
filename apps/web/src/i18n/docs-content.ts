/** Documentation page body per locale. Headings carry explicit `{#id}` anchors so links work in every language. */
import type { Locale } from "./config";

const EN = `# PinFlow Studio documentation

PinFlow Studio edits Arduino and ESP32 sketches as **real C++** and as **blocks** at the same time. This page covers the essentials; the exact language coverage lives in [Supported C++ subset](/docs/arduino-subset).

## Getting started {#getting-started}

1. [Create an account](/signup) — projects are private by default.
2. Pick your skill level, board and layout during onboarding, or skip it.
3. Create a project from a template (the DHT11 + ESP32 example is a good start), a blank sketch, or import an \`.ino\`, \`.cpp\`, \`.h\` or sketch \`.zip\`.

## The workbench {#the-workbench}

- **Blocks** (left) and **code** (right) show the same program. Drag the divider to resize; choose *side by side*, *blocks first*, *code first* or *focus* in the top bar. Pane sizes are remembered.
- **Editing blocks** regenerates the code for that change and applies a minimal edit to the code editor, so your cursor stays put.
- **Editing code** is parsed in a background worker about 300 ms after you stop typing. If it parses, the blocks update in place; your block layout is kept.
- **Syntax errors** never clear your blocks: they keep showing the last valid parse, with a banner and the error in the gutter. Use *Retry* after fixing.
- **Advanced C++ (preserved)** blocks hold code the visual subset cannot express. Their text is kept byte-for-byte; edit it in the inspector or in the code editor. Deleting one asks for confirmation.
- **Undo / redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) restore code and blocks together from one shared history.
- **Click in the code** to select the block that produced it; **select a block** to highlight its code.
- The **left rail** has block search (by name, keyword or alias), variables, libraries, board pins, diagnostics and the coverage report. The **inspector** shows details, source mapping and pin warnings for the selected block.
- **Language and theme**: the globe in the top bar switches the whole interface — including every block, the toolbox categories and block search — between English, French and Arabic (right-to-left). The sun/moon menu picks light, dark or your system theme. The generated C++ never changes with the language.

## Saving {#saving}

Changes autosave about 1.5 s after you pause. The status chip never says *Saved* before the server confirms. If you go offline, changes are kept in your browser (IndexedDB) and saved when you reconnect; after a crash or reload you are offered to recover them. If another tab saved first you get a conflict dialog — reload the latest, or keep yours as a duplicate. Nothing is silently overwritten.

## Compiling {#compiling}

**Compile** saves first, then sends that exact saved revision to the PinFlow compile worker, which runs the real Arduino CLI toolchain in an isolated job. Diagnostics are clickable and jump to the code (and the owning block). If you keep editing, the result is marked **outdated** because its source hash no longer matches. If no compile worker is configured or reachable, PinFlow says so — it never fakes a success.

**Upload** needs the optional local *PinFlow Bridge* and is disabled until it exists.

## Changelog {#changelog}

- **0.2.0** — English, French and Arabic interface and blocks (with right-to-left layout), language switcher and light/dark/system theme menu in every header.
- **0.1.0** — first public build: synchronized Blockly + Monaco workbench, tree-sitter parser in a Web Worker, DHT library blocks, raw-code preservation, autosave with revisions and conflict detection, compile-worker integration, templates.
`;

const FR = `# Documentation de PinFlow Studio

PinFlow Studio modifie les croquis Arduino et ESP32 à la fois en **vrai C++** et en **blocs**. Cette page présente l’essentiel ; la couverture exacte du langage est décrite dans [Sous-ensemble C++ pris en charge](/docs/arduino-subset).

## Prise en main {#getting-started}

1. [Créez un compte](/signup) — les projets sont privés par défaut.
2. Choisissez votre niveau, votre carte et votre disposition pendant l’accueil, ou passez cette étape.
3. Créez un projet à partir d’un modèle (l’exemple DHT11 + ESP32 est un bon début), d’un croquis vierge, ou importez un fichier \`.ino\`, \`.cpp\`, \`.h\` ou un croquis \`.zip\`.

## L’atelier {#the-workbench}

- Les **blocs** et le **code** affichent le même programme. Faites glisser le séparateur pour redimensionner ; choisissez *côte à côte*, *blocs d’abord*, *code d’abord* ou *concentration* dans la barre supérieure. Les tailles des panneaux sont mémorisées.
- **Modifier les blocs** régénère le code concerné et applique une modification minimale dans l’éditeur, pour que votre curseur ne bouge pas.
- **Modifier le code** déclenche une analyse en arrière-plan environ 300 ms après la dernière frappe. Si l’analyse réussit, les blocs se mettent à jour sur place ; leur disposition est conservée.
- Les **erreurs de syntaxe** n’effacent jamais vos blocs : ils continuent d’afficher la dernière analyse valide, avec un bandeau et l’erreur dans la marge. Utilisez *Réessayer* après correction.
- Les blocs **C++ avancé (conservé)** contiennent le code que le sous-ensemble visuel ne sait pas exprimer. Leur texte est conservé à l’octet près ; modifiez-le dans l’inspecteur ou dans l’éditeur de code. Leur suppression demande une confirmation.
- **Annuler / rétablir** (Ctrl/Cmd+Z, Ctrl/Cmd+Maj+Z) restaurent ensemble le code et les blocs grâce à un historique commun.
- **Cliquez dans le code** pour sélectionner le bloc qui l’a produit ; **sélectionnez un bloc** pour surligner son code.
- La **barre latérale** propose la recherche de blocs (par nom, mot-clé ou alias), les variables, les bibliothèques, les broches de la carte, les diagnostics et le rapport de couverture. L’**inspecteur** affiche les détails, la correspondance avec le code et les avertissements de broches du bloc sélectionné.
- **Langue et thème** : le globe de la barre supérieure bascule toute l’interface — y compris chaque bloc, les catégories de la boîte à outils et la recherche de blocs — entre l’anglais, le français et l’arabe (de droite à gauche). Le menu soleil/lune choisit le thème clair, sombre ou celui du système. Le C++ généré ne change jamais avec la langue.

## Enregistrement {#saving}

Les modifications sont enregistrées automatiquement environ 1,5 s après une pause. L’indicateur n’affiche jamais *Enregistré* avant la confirmation du serveur. Hors ligne, les modifications sont conservées dans votre navigateur (IndexedDB) et enregistrées à la reconnexion ; après un plantage ou un rechargement, leur récupération vous est proposée. Si un autre onglet a enregistré avant vous, une boîte de dialogue de conflit s’affiche — rechargez la dernière version ou gardez la vôtre en doublon. Rien n’est écrasé en silence.

## Compilation {#compiling}

**Compiler** enregistre d’abord, puis envoie cette révision exacte au worker de compilation PinFlow, qui exécute la véritable chaîne d’outils Arduino CLI dans une tâche isolée. Les diagnostics sont cliquables et mènent au code (et au bloc concerné). Si vous continuez à modifier, le résultat est marqué **obsolète** car l’empreinte du code ne correspond plus. Si aucun worker de compilation n’est configuré ou joignable, PinFlow l’indique — il ne simule jamais un succès.

**Téléverser** nécessite l’application locale facultative *PinFlow Bridge* et reste désactivé tant qu’elle n’existe pas.

## Journal des modifications {#changelog}

- **0.2.0** — interface et blocs en anglais, français et arabe (avec mise en page de droite à gauche), sélecteur de langue et menu de thème clair/sombre/système dans chaque en-tête.
- **0.1.0** — première version publique : atelier Blockly + Monaco synchronisé, analyseur tree-sitter dans un Web Worker, blocs de la bibliothèque DHT, conservation du code brut, enregistrement automatique avec révisions et détection des conflits, intégration du worker de compilation, modèles.
`;

const AR = `# توثيق PinFlow Studio

يحرّر PinFlow Studio رسومات Arduino وESP32 كشيفرة **C++‎ حقيقية** وككتل **مرئية** في الوقت نفسه. تغطي هذه الصفحة الأساسيات، أما التغطية الدقيقة للغة فموجودة في [مجموعة C++‎ المدعومة](/docs/arduino-subset).

## البدء {#getting-started}

1. [أنشئ حسابًا](/signup) — المشاريع خاصة افتراضيًا.
2. اختر مستوى خبرتك ولوحتك وتخطيط المحرر أثناء الإعداد الأولي، أو تخطَّ ذلك.
3. أنشئ مشروعًا من قالب (مثال DHT11 مع ESP32 بداية جيدة)، أو من رسمة فارغة، أو استورد ملف \`.ino\` أو \`.cpp\` أو \`.h\` أو رسمة مضغوطة \`.zip\`.

## منصة العمل {#the-workbench}

- تعرض **الكتل** و**الشيفرة** البرنامج نفسه. اسحب الفاصل لتغيير الحجم، واختر *جنبًا إلى جنب* أو *الكتل أولًا* أو *الشيفرة أولًا* أو *التركيز* من الشريط العلوي. تُحفظ أحجام اللوحات.
- **تعديل الكتل** يعيد توليد الشيفرة الخاصة بذلك التغيير ويطبّق أصغر تعديل ممكن في محرر الشيفرة، فيبقى المؤشر في مكانه.
- **تعديل الشيفرة** يُحلَّل في عامل خلفي بعد نحو 300 م.ث من توقفك عن الكتابة. إذا نجح التحليل تتحدّث الكتل في مكانها مع الحفاظ على تخطيطها.
- **أخطاء الصياغة** لا تمسح كتلك أبدًا: تبقى معروضة وفق آخر تحليل صالح، مع شريط تنبيه والخطأ في الهامش. استخدم *إعادة المحاولة* بعد التصحيح.
- تحتوي كتل **C++‎ متقدّم (محفوظ)** على الشيفرة التي لا تستطيع المجموعة المرئية التعبير عنها. يُحفظ نصها حرفيًا، ويمكنك تعديله في لوحة الفحص أو في محرر الشيفرة. يتطلب حذفها تأكيدًا.
- **التراجع / الإعادة** (Ctrl/Cmd+Z وCtrl/Cmd+Shift+Z) تستعيد الشيفرة والكتل معًا من سجل مشترك واحد.
- **انقر في الشيفرة** لتحديد الكتلة التي أنتجتها، و**حدد كتلة** لإبراز شيفرتها.
- يضم **الشريط الجانبي** البحث عن الكتل (بالاسم أو الكلمة المفتاحية أو الاسم البديل) والمتغيرات والمكتبات ومنافذ اللوحة والتشخيصات وتقرير التغطية. وتعرض **لوحة الفحص** تفاصيل الكتلة المحددة وربطها بالشيفرة وتحذيرات المنافذ.
- **اللغة والسمة**: تبدّل أيقونة الكرة الأرضية في الشريط العلوي الواجهة كلها — بما في ذلك كل كتلة وفئات صندوق الأدوات والبحث عن الكتل — بين الإنجليزية والفرنسية والعربية (من اليمين إلى اليسار). وتتيح قائمة الشمس/القمر اختيار السمة الفاتحة أو الداكنة أو سمة النظام. لا تتغير شيفرة C++‎ المولَّدة أبدًا بتغيير اللغة.

## الحفظ {#saving}

تُحفظ التغييرات تلقائيًا بعد نحو 1.5 ثانية من توقفك. لا يعرض مؤشر الحالة *تم الحفظ* قبل تأكيد الخادم. إذا انقطع الاتصال تُحفظ التغييرات في متصفحك (IndexedDB) ثم تُرسل عند عودة الاتصال، وبعد أي تعطل أو إعادة تحميل يُعرض عليك استعادتها. إذا حفظ تبويب آخر قبلك تظهر نافذة تعارض — حمّل الأحدث أو احتفظ بنسختك كنسخة مكررة. لا يُستبدل أي شيء بصمت.

## الترجمة {#compiling}

يحفظ زر **ترجمة** أولًا، ثم يرسل تلك المراجعة المحفوظة بالضبط إلى عامل الترجمة في PinFlow، الذي يشغّل سلسلة أدوات Arduino CLI الحقيقية في مهمة معزولة. التشخيصات قابلة للنقر وتنقلك إلى الشيفرة (وإلى الكتلة المعنية). إذا واصلت التعديل تُعلَّم النتيجة بأنها **قديمة** لأن بصمة الشيفرة لم تعد مطابقة. وإذا لم يكن عامل الترجمة مُعدًّا أو متاحًا فإن PinFlow يوضح ذلك — ولا يدّعي النجاح أبدًا.

يتطلب **الرفع** التطبيق المحلي الاختياري *PinFlow Bridge* ويبقى معطّلًا إلى أن يتوفر.

## سجل التغييرات {#changelog}

- **0.2.0** — واجهة وكتل بالإنجليزية والفرنسية والعربية (مع تخطيط من اليمين إلى اليسار)، ومبدّل اللغة وقائمة السمة الفاتحة/الداكنة/حسب النظام في كل ترويسة.
- **0.1.0** — أول إصدار عام: منصة عمل متزامنة بين Blockly وMonaco، ومحلّل tree-sitter داخل Web Worker، وكتل مكتبة DHT، وحفظ الشيفرة الخام، وحفظ تلقائي مع مراجعات واكتشاف للتعارض، وتكامل مع عامل الترجمة، وقوالب.
`;

export const DOCS_BODY: Record<Locale, string> = { en: EN, fr: FR, ar: AR };
