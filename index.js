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
        '<div style="line-height: 34px; background-color: #80808080;" id="regions-params">',
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
        hotels.features.length /= 4;
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

                //Создание градиента для легенды
                jQuery('.legend-gradient').css('background', 'linear-gradient(to bottom, rgba(100, 0, 100, 1), rgba(255, 150, 100, 1))');

                //Проверка принадлежности точки полигону
                var t0 = performance.now();

                var contains = false;
                var numberOfFeatures = res.features.length;
                var numberOfHotels = hotels.features.length;
                var numberOfAllPolygons = 0;

                var hotelsInRussia = 0;
                var iterationsCount = 0;

                for (var i = 0; i < numberOfFeatures; i++) {

                    res.features[i].properties["pointsNumber"] = 0;

                    for(var k = 0; k < res.features[i].geometry.coordinates.length; k++) {
                        numberOfAllPolygons++;
                        //var myPolygon = new ymaps.geometry.Polygon([res.features[i].geometry.coordinates[k]]);
                        //myPolygon.options.setParent(map.options);
                        //myPolygon.setMap(map);

                        for (var j = 0; j < hotels.features.length; j++) {
                            iterationsCount++;
                            // Алгоритм Яндекса (~1.5 sec при 100 000 итерациях)
                            // contains = myPolygon.contains(hotels.features[j].geometry.coordinates);

                            // Метод трассировки луча (без учета граничных случаев). (~200 ms при 100 000 итерациях)
                            //contains = notAccurateRayCast(hotels.features[j].geometry.coordinates, res.features[i].geometry.coordinates[k]);

                            // Улучшенный, точный метод трассировки луча. (~270 ms при 100 000 итерациях) (~1 sec при 500 000 итерациях) (~2.2 sec при 1млн. итераций)
                            contains = classifyPoint(res.features[i].geometry.coordinates[k], hotels.features[j].geometry.coordinates);

                            if (contains !== 1) {
                                res.features[i].properties["pointsNumber"]++;
                                hotelsInRussia++;

                                // Увеличиваем эффективность алгоритма.
                                // Чем больше точек принадлежит текущей стране, тем выше эффективность данной строчки.
                                hotels.features.splice(j--, 1);
                            }
                        }
                    }
                }

                var scriptTime = performance.now() - t0;

                // Логирование значений
                console.log('Кол-во итераций ' + iterationsCount);
                console.log('Кол-во полигонов ' + numberOfAllPolygons);
                console.log('Кол-во точек ' + numberOfHotels);
                console.log('Время работы скрипта ' + scriptTime.toFixed(2) + ' ms');
                console.log(' ');
                console.log('Всего в границы России попало ' + hotelsInRussia + ' точек.');
                console.log(' ');

                var localMaximum = 0;
                for (var i = 0; i < numberOfFeatures; i++) {
                    var num = res.features[i].properties["pointsNumber"];

                    if (localMaximum < num) {
                        localMaximum = num;
                    }

                    if (res.features[i].properties["pointsNumber"] > 0) {
                        console.log(res.features[i].properties.name + ' ' + num + ' отелей.');
                    }
                }

                // Выбираем экстремум.
                hotelsInRussia = localMaximum;

                this.regions = new ymaps.ObjectManager();
                this.regions
                    .add(res.features.map(function (feature, i) {


                        // Цветовые составляющие
                        var R = 355 - (100 + Math.floor(155 * feature.properties["pointsNumber"] / hotelsInRussia));
                        var G = 150 - Math.floor(150 * feature.properties["pointsNumber"] / hotelsInRussia);
                        var B = 100;
                        var alpha = feature.properties["pointsNumber"] ? 0.9 : 0.1;

                        feature.options = {fillColor: "rgba(" + R + ", " + G + ", " + B + ", " + alpha + ")"};


                        feature.id = feature.properties.iso3166;
                        return feature;
                    }));

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