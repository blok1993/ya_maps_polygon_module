var REGIONS_DATA = {
        region: {
            title: 'Регион',
            items: [{
                id: '001',
                title: 'Страны мира'
            }, {
                id: 'BY',
                title: 'Беларусь'
            }, {
                id: 'KZ',
                title: 'Казахстан'
            }, {
                id: 'RU',
                title: 'Россия'
            }, {
                id: 'TR',
                title: 'Турция'
            }, {
                id: 'UA',
                title: 'Украина'
            }]
        },
        lang: {
            title: 'Язык',
            items: [{
                id: 'en',
                title: 'Английский'
            }, {
                id: 'be',
                title: 'Белорусский'
            }, {
                id: 'kk',
                title: 'Казахский'
            }, {
                id: 'ru',
                title: 'Русский'
            }, {
                id: 'tr',
                title: 'Турецкий'
            }, {
                id: 'uk',
                title: 'Украинский'
            }]
        },
        quality: {
            title: 'Точность границ',
            items: [{
                id: '0',
                title: '0'
            }, {
                id: '1',
                title: '1'
            }, {
                id: '2',
                title: '2'
            }, {
                id: '3',
                title: '3'
            }]
        }
    },
    // Шаблон html-содержимого макета.
    optionsTemplate = [
        '<div style="line-height: 34px; visibility: hidden; background-color: #80808080;" id="regions-params">',
        '{% for paramName, param in data.params %}',
        '{% for key, value in state.values %}',
        '{% if key == paramName %}',
        '<div class="btn-group btn-group-xs">',
        '<button{% if state.enabled %}{% else %} disabled{% endif %} type="button" class="btn btn-primary dropdown-toggle" data-toggle="dropdown">',
        '<span>{{ param.title }}</span>',
        '<span class="value">: {{ value }}</span>',
        '&nbsp;<span class="caret"></span>',
        '</button>',
        '<ul class="dropdown-menu {{ paramName }}">',
        '{% for item in param.items %}',
        '<li{% if item.id == value %} class="active"{% endif %}>',
        '<a id="regions" href="#" data-param="{{ paramName }}" data-id="{{ item.id }}">',
        '{{ item.title }}',
        '</a>',
        '</li>',
        '{% endfor %}',
        '</ul>',
        '</div>&nbsp;',
        '{% endif %}',
        '{% endfor %}',
        '{% endfor %}',
        '</div>'
    ].join('');

var hotels = [];

$.ajax('data/hotels.json', {
    success: function(data) {
        hotels = data;

        // Для демонстрации возьмем 2500 точек.
        hotels.features.length = 2500;
        ymaps.ready(init);
    }
});

// Метод трассировки луча.
// Не работает надежно, когда точка является углом многоугольника или края.
function notAccurateRayCast(point, vs) {
    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

var classifyPoint = require("robust-point-in-polygon");
var forTests = [];

function init() {
    // Создадим собственный макет RegionControl.
    var RegionControlLayout = ymaps.templateLayoutFactory.createClass(optionsTemplate, {
            build: function () {
                RegionControlLayout.superclass.build.call(this);
                this.handleClick = ymaps.util.bind(this.handleClick, this);
                $(this.getParentElement)
                    .on('click', 'a#regions', this.handleClick);
            },
            clear: function () {
                $(this.getParentElement)
                    .off('click', 'a#regions', this.handleClick);
                RegionControlLayout.superclass.clear.call(this);
            },
            handleClick: function (e) {
                e.preventDefault();
                var $target = $(e.currentTarget);
                var state = this.getData().state;
                var newValues = ymaps.util.extend({}, state.get('values'));
                if (!$target.hasClass('active')) {
                    newValues[$target.data('param')] = $target.data('id');
                    state.set('values', newValues);
                }
            }
        }),
        // Наследуем класс нашего контрола от ymaps.control.Button.
        RegionControl = ymaps.util.defineClass(function (parameters) {
            RegionControl.superclass.constructor.call(this, parameters);
        }, ymaps.control.Button, /** @lends ymaps.control.Button */{
            onAddToMap: function (map) {
                RegionControl.superclass.onAddToMap.call(this, map);
                this.setupStateMonitor();
                this.loadRegions(this.state.get('values'));
            },

            onRemoveFromMap: function (map) {
                map.geoObjects.remove(this.regions);
                this.clearStateMonitor();
                RegionControl.superclass.onRemoveFromMap.call(this, map);
            },

            setupStateMonitor: function () {
                this.stateMonitor = new ymaps.Monitor(this.state);
                this.stateMonitor.add('values', this.handleStateChange, this);
            },

            clearStateMonitor: function () {
                this.stateMonitor.removeAll();
            },

            handleStateChange: function (params) {
                this.loadRegions(params);
            },

            handleRegionsLoaded: function (res) {
                if(this.regions){
                    map.geoObjects.remove(this.regions);
                }

                // Создаем легенду
                this._legendCreation();

                // Проверка принадлежности точки полигону
                var updatedFeatures = this._getDataDistribution(res.features, hotels.features);

                // Выбираем экстремум.
                var localExtremum = this._getLocalMaximum(updatedFeatures);

                this.regions = new ymaps.ObjectManager();
                this.regions
                    .add(updatedFeatures.map(function (feature) {

                        // Цветовые составляющие
                        var R = 355 - (100 + Math.floor(155 * feature.properties["pointsNumber"] / localExtremum));
                        var G = 150 - Math.floor(150 * feature.properties["pointsNumber"] / localExtremum);
                        var B = 100;
                        var alpha = feature.properties["pointsNumber"] ? 0.9 : 0.1;

                        feature.options = {fillColor: "rgba(" + R + ", " + G + ", " + B + ", " + alpha + ")"};

                        feature.id = feature.properties.iso3166;

                        return feature;
                    }));

                // Создание независимого экземпляра балуна
                // и отображение его в центре конкретного полигона.
                var objectManager = this.regions;

                var balloon = new ymaps.Balloon(map);
                balloon.options.setParent(map.options);
                
                var interactiveSettings = {
                    mouseEnter: {
                        fillOpacity: 0.5,
                        strokeWidth: 2
                    },
                    mouseLeave: {
                        fillOpacity: 1,
                        strokeWidth: 1
                    }
                };

                this.regions.events.add('click', function(e) {
                    var objId = e.get('objectId');
                    var object = objectManager.objects.getById(objId);
                    var someHtml = object.properties.name + '<br> кол-во точек ' + object.properties.pointsNumber;

                    balloon.setData({ content: someHtml });
                    balloon.open(object.geometry.coordinates[0][0]);
                });

                this.regions.events.add('mouseenter', function (e) {
                    var objId = e.get('objectId');

                    objectManager.objects.setObjectOptions(objId, interactiveSettings.mouseEnter);
                });

                this.regions.events.add('mouseleave', function (e) {
                    var objId = e.get('objectId');

                    objectManager.objects.setObjectOptions(objId, interactiveSettings.mouseLeave);
                });

                map.geoObjects.add(this.regions);

                this.getMap().setBounds(
                    this.regions.getBounds(),
                    {checkZoomRange: true}
                );
            },

            loadRegions: function (params) {
                this.disable();
                return ymaps.borders.load(params.region, params)
                    .then(this.handleRegionsLoaded, this)
                    .always(this.enable, this);
            },

            _legendCreation: function () {
                //Создание градиента для легенды
                jQuery('.legend-gradient').css('background', 'linear-gradient(to bottom, rgba(100, 0, 100, 1), rgba(255, 150, 100, 1))');
            },

            _getDataDistribution: function (regions, data) {
                var t0 = performance.now();

                var contains = false;
                var numberOfFeatures = regions.length;
                var numberOfHotels = data.length;
                var numberOfAllPolygons = 0;

                var localExtremum = 0;
                var iterationsCount = 0;

                for (var i = 0; i < numberOfFeatures; i++) {

                    regions[i].properties["pointsNumber"] = 0;

                    for(var k = 0; k < regions[i].geometry.coordinates.length; k++) {
                        numberOfAllPolygons++;
                        // var myPolygon = new ymaps.geometry.Polygon([res.features[i].geometry.coordinates[k]]);
                        // myPolygon.options.setParent(map.options);
                        // myPolygon.setMap(map);

                        for (var j = 0; j < data.length; j++) {
                            iterationsCount++;
                            // Алгоритм Яндекса (~1.5 sec при 100 000 итерациях)
                            //contains = myPolygon.contains(hotels.features[j].geometry.coordinates.reverse());

                            // Метод трассировки луча (без учета граничных случаев). (~200 ms при 100 000 итерациях)
                            //contains = notAccurateRayCast(hotels.features[j].geometry.coordinates, res.features[i].geometry.coordinates[k]);

                            // Улучшенный, точный метод трассировки луча. (~270 ms при 100 000 итерациях) (~1 sec при 500 000 итерациях) (~2.2 sec при 1млн. итераций)
                            contains = classifyPoint(regions[i].geometry.coordinates[k], data[j].geometry.coordinates.reverse());

                            if (contains !== 1) {
                                // if (contains) {
                                regions[i].properties["pointsNumber"]++;
                                localExtremum++;

                                // Увеличиваем эффективность алгоритма.
                                // Чем больше точек принадлежит текущей стране, тем выше эффективность данной строчки.
                                data.splice(j--, 1);

                                forTests.push(hotels.features[j].geometry.coordinates.reverse());
                            }
                        }
                    }
                }

                var scriptTime = performance.now() - t0;
                yaCounter48808478.reachGoal('algorithm', {time: scriptTime.toFixed(2)});
                yaCounter48808478.userParams({
                    algorithm: scriptTime.toFixed(2) + "ms"
                });


                // Тесты больших данных
                // Big tests
                //var hotels2500 = [[12.945869271885199,100.895141545963],[47.324259999999995,12.79867],[44.396294448339795,33.977667304400605],[15.534126800000001,73.76060840000001],[47.0078003855025,8.34040164110456],[43.7658206071802,11.284676228836],[43.9669711,12.743324099999999],[7.88446438385799,98.2982946527786],[38.897811929019106,1.4174980171966398],[-33.862753999999995,151.20928600000002],[40.643409999999996,22.91054],[37.15881595,27.55422592],[57.805016099999996,28.3356014999999],[-6.1620549878914295,39.187253589935295],[11.9376104968082,108.440402331352],[43.403591226837705,39.963762213128206],[36.454132685222795,28.2193553030758],[41.0060688195189,28.953968515205396],[47.493556,11.080401],[8.907098,76.57797],[41.01528,28.68163],[41.6998,2.8466259999999997],[53.2922935908778,-6.133663023278809],[55.2966602391106,61.510829153466794],[-5.878092344556951,39.3529884113311],[40.32588,23.9814],[44.596057,34.37147],[36.545211405426,31.9865762783431],[46.552404834496,11.874761579049],[44.5088295852585,40.1753817773239],[29.5512553334133,34.9618322453689],[36.8891399336785,27.2016721818924],[59.924490000000006,30.354196999999996],[46.29888560824579,7.0568057804259805],[36.8253612810897,55.73393492497949],[23.655928182950802,57.871751335907],[41.90931350714929,12.4564678204059],[59.90977579999999,30.316818800000004],[15.619010000000001,73.73384],[41.2967324616181,13.2707253140368],[48.652875555647704,44.441879377315395],[12.9235410515429,100.877487451076],[9.54980048092638,100.053060474869],[42.65919198,27.73404926],[44.797734999999996,13.9136996],[43.300377262340206,28.0490129153443],[47.128640000000004,10.26535],[33.59121,-7.67652],[10.54608,-85.7252],[51.5148805937815,-0.17256429493716002],[39.54101765,2.447247505],[40.08354,23.8070299999999],[7.166620603363509,79.8669055090637],[43.8930665500833,10.226396093254198],[47.128613603883295,10.2135701655614],[7.92926869793957,98.2773843547699],[33.945672722508505,-118.38163428703301],[32.0771179,34.7681424],[41.00818601,28.95860106],[41.0407720882161,28.9820426527787],[36.88378,30.704629999999998],[36.37337,25.48328],[41.14799,-8.606575999999999],[43.77415,13.13074],[55.6864265693875,52.2950273679733],[12.9512,100.9],[46.428231,11.684241],[45.48622973,12.59426951],[40.41652,-3.6986800000000004],[48.1666123,11.586619],[37.626799043655,54.189429271400996],[37.626799043655,54.189429271400996],[20.0266,-75.8107],[45.061350741038396,7.67440854232791],[38.765809999999995,-9.36612],[38.1977481574986,13.3205458027359],[36.3911284537705,28.0522793042297],[11.96171,121.9244],[36.3314975872667,28.2014068809509],[46.3891,-78.8267],[43.484004299999995,-1.55860210000003],[1.25124435676813,103.822359145963],[40.389,0.411268],[41.9962,1.517201],[37.422819898121205,25.323129593447103],[51.4740238985495,-0.18363658095086102],[43.4080087,39.9905151],[46.42703147,11.68520451],[9.561160000000001,100.02600000000001],[43.045552955493605,11.814628746032698],[44.06935401776239,12.579133803893098],[41.38401555,2.163021192],[10.7966657485254,106.673196152115],[36.2383,-115.06200000000001],[52.4373211320236,13.4630004974365],[42.541000000000004,1.73088],[16.068110317098302,108.244202423279],[61.797736,34.29996],[43.345397,28.062697999999997],[42.2827309046935,18.8624570846557],[37.9848419,23.7288566],[51.4959,-0.181356],[42.71239416,27.76150078],[41.030490164297106,28.973492049242502],[41.00719,28.97327],[44.281745956544,12.3498608037396],[-122.40436084655799,37.7852211038255],[42.4172,27.6995],[36.5567076213281,30.564308167885198],[20.6326,-87.0683],[10.771975984379802,106.69043168849899],[47.5376984068484,21.6257382618518],[40.7914755104274,24.634802339311598],[41.3938597,2.1535268430000003],[31.189344547869002,121.56025094708299],[51.449870000000004,-0.40729],[53.34813362412871,-6.24676734722141],[43.7306,7.16219],[41.1877745765939,-8.59743815705883],[50.2223421725566,12.8847030392151],[42.29376,18.85043],[25.258793,55.322173],[45.8549,6.63063],[10.771745800000001,106.69470049999998],[43.4921002215829,39.890469671630896],[36.8253612810897,55.73393492497949],[41.38795379,2.1511282769999998],[48.19173809,16.37428522],[41.7747,12.6477],[45.5947,25.5486],[44.894953,37.328129],[37.85157,15.285129999999999],[17.8852842353824,-77.7680834427833],[-122.40436084655799,37.7852211038255],[-22.928208544583303,-43.1748591576721],[48.8712,2.33839],[-33.8783,151.204],[42.2862149514979,18.853240638237],[24.4007,53.3851],[24.4007,53.3851],[44.1471974764563,9.655571778712439],[43.60988,39.707],[55.9511901060659,-3.1859413399505496],[42.57893,1.658327],[41.934059999999995,-87.64358],[36.61026579,30.557382699999998],[36.7308966396488,-3.6949684232788504],[53.06280079999999,8.7875961],[42.681731,23.332544],[6.03866,80.2188],[36.4818294,32.10106373],[43.96748954103129,12.7498796976226],[7.94955904969413,80.7611127410698],[40.26941647253871,22.5969660569],[42.68823602,27.70389318],[55.197987219920904,29.925295160296603],[8.04103754546784,98.81366908859829],[47.8998519060929,13.569921611831699],[41.651617,41.638952],[39.143703048884504,23.4459109064293],[41.2845024189301,13.2159875226845]];
                //var hotels5000 = [[12.945869271885199,100.895141545963],[47.324259999999995,12.79867],[44.396294448339795,33.977667304400605],[37.763306232948,15.214440609786902],[41.397467,2.147521],[42.279018783091395,18.834760253967303],[15.534126800000001,73.76060840000001],[47.0078003855025,8.34040164110456],[43.550774124447,7.00655725449224],[43.7658206071802,11.284676228836],[8.646169179230041,98.2474521276474],[43.9669711,12.743324099999999],[45.45470973265449,6.900482302871751],[48.85159603,2.3486079280000003],[7.88446438385799,98.2982946527786],[6.910912699356119,45.704433756678],[38.897811929019106,1.4174980171966398],[46.965446899999996,11.007798],[45.4088771169056,36.957552341903],[51.2208,6.7853],[-33.862753999999995,151.20928600000002],[40.643409999999996,22.91054],[37.15881595,27.55422592],[57.805016099999996,28.3356014999999],[-6.1620549878914295,39.187253589935295],[11.9376104968082,108.440402331352],[43.403591226837705,39.963762213128206],[36.454132685222795,28.2193553030758],[41.0060688195189,28.953968515205396],[47.493556,11.080401],[37.12036,-8.5784],[37.95136,23.71012],[8.907098,76.57797],[41.01528,28.68163],[13.690025088434599,100.729321865082],[41.623378,41.623872],[41.6998,2.8466259999999997],[53.2922935908778,-6.133663023278809],[27.3947698070367,33.6797511772156],[55.2966602391106,61.510829153466794],[-5.878092344556951,39.3529884113311],[40.32588,23.9814],[44.7211536,37.7650973],[42.893243,10.941781],[40.666626,16.608089],[44.596057,34.37147],[36.545211405426,31.9865762783431],[46.552404834496,11.874761579049],[8.388732000000001,76.97749],[55.7051829855163,36.8695369743301],[43.9437364990172,4.798057751808639],[44.5088295852585,40.1753817773239],[29.5512553334133,34.9618322453689],[-5.9019655213851205,39.354917190837796],[60.586378,56.826347999999996],[36.8891399336785,27.2016721818924],[59.924490000000006,30.354196999999996],[46.29888560824579,7.0568057804259805],[36.8253612810897,55.73393492497949],[23.655928182950802,57.871751335907],[41.90931350714929,12.4564678204059],[59.90977579999999,30.316818800000004],[15.619010000000001,73.73384],[50.14452796768539,15.116482682209],[42.925311478882996,13.8973035195488],[12.930930920327402,100.89549053955099],[4.88398269999993,52.364971000000004],[41.2967324616181,13.2707253140368],[48.652875555647704,44.441879377315395],[12.9235410515429,100.877487451076],[9.54980048092638,100.053060474869],[42.65919198,27.73404926],[44.797734999999996,13.9136996],[43.300377262340206,28.0490129153443],[47.128640000000004,10.26535],[33.59121,-7.67652],[10.54608,-85.7252],[51.5148805937815,-0.17256429493716002],[39.54101765,2.447247505],[40.08354,23.8070299999999],[7.166620603363509,79.8669055090637],[43.8930665500833,10.226396093254198],[47.128613603883295,10.2135701655614],[7.92926869793957,98.2773843547699],[33.945672722508505,-118.38163428703301],[32.0771179,34.7681424],[41.00818601,28.95860106],[41.0407720882161,28.9820426527787],[36.88378,30.704629999999998],[36.37337,25.48328],[41.14799,-8.606575999999999],[43.77415,13.13074],[55.6864265693875,52.2950273679733],[12.9512,100.9],[46.428231,11.684241],[45.48622973,12.59426951],[40.41652,-3.6986800000000004],[48.1666123,11.586619],[37.626799043655,54.189429271400996],[37.626799043655,54.189429271400996],[20.0266,-75.8107],[45.061350741038396,7.67440854232791],[38.765809999999995,-9.36612],[38.1977481574986,13.3205458027359],[36.3911284537705,28.0522793042297],[11.96171,121.9244],[36.3314975872667,28.2014068809509],[46.3891,-78.8267],[43.484004299999995,-1.55860210000003],[1.25124435676813,103.822359145963],[40.389,0.411268],[33.9461412756568,-118.38484332275401],[12.238719999999999,109.19606],[31.62207,-7.9976],[7.8172,98.30060999999999],[53.49881056352329,107.50928896011],[41.6422233713269,41.634706467983996],[55.698252000000004,37.763238],[43.709252656527795,7.28466787051389],[38.710228614388,-9.130696893646249],[58.6021300870312,49.623912588954894],[56.4804870217581,85.0008133153442],[54.954253,39.018608],[38.70775,-9.400139999999999],[37.09333,-8.227782000000001],[46.784960999999996,17.190548],[44.07707,12.55367],[-6.817844,39.2804],[36.3316227666926,28.208451878357],[45.07939982,14.1724544799999],[47.3935677433426,13.6868369584352],[36.8600646851117,30.996677025795],[31.200575,121.443102],[43.4569867016575,39.961132468128206],[20.491006153872398,-87.2396750087373],[45.43168,6.592035000000001],[55.77080600000001,37.64864],[38.759061024328496,44.2996738408675],[37.5322,15.0801],[-5.735812,39.291909999999994],[55.705783864710504,37.5641980760574],[57.135913,65.597075],[37.3683408663023,23.2223095100403],[41.9962,1.517201],[37.422819898121205,25.323129593447103],[51.4740238985495,-0.18363658095086102],[43.4080087,39.9905151],[46.42703147,11.68520451],[9.561160000000001,100.02600000000001],[43.045552955493605,11.814628746032698],[44.06935401776239,12.579133803893098],[41.38401555,2.163021192],[10.7966657485254,106.673196152115],[36.2383,-115.06200000000001],[39.1873,-106.821],[10.273721499999999,47.1380924],[21.15973,-86.82896],[40.7186454961516,-73.9925846042992],[-6.213376723204499,106.818673783367],[35.36501,24.47363],[39.991768016382,22.6262747227192],[37.81015691,20.87696314],[44.062381244176905,28.6369897743091],[60.4642117582664,56.98930995290999],[43.8687135357893,10.2428697374344],[57.205122051160295,32.9802739954926],[37.646262946627104,55.819749177627706],[48.88410862,2.349006906],[52.4373211320236,13.4630004974365],[42.541000000000004,1.73088],[16.068110317098302,108.244202423279],[61.797736,34.29996],[55.756787925619705,37.5964674522399],[-20.4670130285645,57.3137110185241],[48.856614,2.35222190000002],[43.345397,28.062697999999997],[42.2827309046935,18.8624570846557],[37.9848419,23.7288566],[51.4959,-0.181356],[44.799269,37.420455],[47.03063,18.01984],[42.71239416,27.76150078],[41.030490164297106,28.973492049242502],[41.00719,28.97327],[40.7762798720664,24.605088679901097],[55.755293,37.5671170000001],[37.9539,29.1115],[44.281745956544,12.3498608037396],[-122.40436084655799,37.7852211038255],[42.4172,27.6995],[6.910912699356119,45.704433756678],[36.5567076213281,30.564308167885198],[55.7986864122938,49.1195168376922],[36.6984201385076,-6.12546729839482],[59.9139414219686,10.777342690213],[38.4278734,27.135541200000002],[20.6326,-87.0683],[10.771975984379802,106.69043168849899],[10.273721499999999,47.1380924],[47.5376984068484,21.6257382618518],[40.7914755104274,24.634802339311598],[41.3938597,2.1535268430000003],[31.189344547869002,121.56025094708299],[-4.3253,55.70921],[43.697515010984404,7.2616385239121],[51.449870000000004,-0.40729],[53.34813362412871,-6.24676734722141],[43.7306,7.16219],[41.1877745765939,-8.59743815705883],[50.2223421725566,12.8847030392151],[42.29376,18.85043],[25.258793,55.322173],[41.9040628702921,12.505551793601198],[47.0387281295939,10.603940258392],[35.3083836072681,25.5244129153442],[37.646262946627104,55.819749177627706],[45.8549,6.63063],[10.771745800000001,106.69470049999998],[43.4921002215829,39.890469671630896],[36.8253612810897,55.73393492497949],[41.38795379,2.1511282769999998],[41.8238,23.4807],[45.43600000000001,12.3388],[44.87415,13.849979999999999],[48.19173809,16.37428522],[41.7747,12.6477],[39.771250551906,3.14606116567609],[1.31152390432447,103.87756862831101],[19.866323,102.10813],[45.5947,25.5486],[44.894953,37.328129],[37.85157,15.285129999999999],[17.8852842353824,-77.7680834427833],[-122.40436084655799,37.7852211038255],[4.88398269999993,52.364971000000004],[56.832156000000005,60.599238],[-22.928208544583303,-43.1748591576721],[48.8712,2.33839],[-33.8783,151.204],[42.2862149514979,18.853240638237],[24.4007,53.3851],[24.4007,53.3851],[44.1471974764563,9.655571778712439],[43.60988,39.707],[55.9511901060659,-3.1859413399505496],[42.57893,1.658327],[41.934059999999995,-87.64358],[36.61026579,30.557382699999998],[36.7308966396488,-3.6949684232788504],[53.06280079999999,8.7875961],[42.681731,23.332544],[6.03866,80.2188],[36.4818294,32.10106373],[43.96748954103129,12.7498796976226],[35.33846597147421,25.057286826705898],[52.0985064,23.6853244],[42.1377,19.0525],[14.5651041900644,121.034416294098],[43.3819163850807,40.0402285128976],[43.3094,40.2533],[47.50035,19.10352],[38.759061024328496,44.2996738408675],[7.94955904969413,80.7611127410698],[48.83347,2.24423],[40.26941647253871,22.5969660569],[42.68823602,27.70389318],[46.5505985519524,10.142233861160301],[12.5632893242578,99.96048685382851],[26.978715567765605,33.9138749231552],[48.87562965509439,2.29561565410609],[55.756875,37.646215999999995],[55.197987219920904,29.925295160296603],[8.04103754546784,98.81366908859829],[47.8998519060929,13.569921611831699],[41.651617,41.638952],[41.9070679004511,12.4966685798233],[39.143703048884504,23.4459109064293],[41.2845024189301,13.2159875226845]];
                // var passed = true;
                // for (var m = 0; m < hotels2500.length; m++) {
                //     if (hotels2500[m][0] !== forTests[m][0] || hotels2500[m][1] !== forTests[m][1]) {
                //         passed = false;
                //         break;
                //     }
                // }
                //
                // console.log('big tests ' + (passed ? 'passed' : 'failed'));

                // Логирование значений
                console.log('Кол-во итераций ' + iterationsCount);
                console.log('Кол-во полигонов ' + numberOfAllPolygons);
                console.log('Кол-во точек ' + numberOfHotels);
                console.log('Время работы скрипта ' + scriptTime.toFixed(2) + ' ms');
                console.log(' ');
                console.log('Всего в границы России попало ' + localExtremum + ' точек.');
                console.log(' ');

                return regions;
            },

            _getLocalMaximum: function (regions) {
                var localMaximum = 0;

                for (var i = 0; i < regions.length; i++) {
                    var num = regions[i].properties["pointsNumber"];

                    if (localMaximum < num) {
                        localMaximum = num;
                    }

                    if (regions[i].properties["pointsNumber"] > 0) {
                        console.log(regions[i].properties.name + ' ' + num + ' отелей.');
                    }
                }

                return localMaximum;
            }
        }),

        map = new ymaps.Map('map', {
            center: [50, 30],
            zoom: 3,
            controls: ['typeSelector']
        }, {
            typeSelectorSize: 'small'
        }),

        // Создадим экземпляр RegionControl.
        regionControl = new RegionControl({
            state: {
                enabled: true,
                values: {
                    region: 'RU',
                    lang: 'ru',
                    quality: '1'
                }
            },
            data: {
                params: REGIONS_DATA
            },
            options: {
                layout: RegionControlLayout
            },
            float: 'left',
            maxWidth: [300]
        });

    // Добавим контрол на карту.
    map.controls.add(regionControl);
    // Узнавать о изменениях параметров RegionControl можно следующим образом.
    regionControl.events.add('statechange', function (e) {
        console.log(e.get('target').get('values'));
    });
}